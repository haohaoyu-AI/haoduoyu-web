// Read-only MSI safety gates. No file deletion, migration, process control, network or elevation.
// Checks are repeated in the execution script. They do not eliminate every malicious concurrent path replacement.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define _WIN32_MSI 500
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>
#include <msi.h>
#include <msiquery.h>
#include <shlobj.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <cwchar>

#pragma comment(lib, "msi.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "advapi32.lib")

namespace {
constexpr wchar_t UpgradeCode[] = L"{E13CC61A-A22B-4C8A-A8D2-8EAB92679C50}";
struct Handle {
    HANDLE value;
    explicit Handle(HANDLE handle) : value(handle) {}
    ~Handle() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
std::wstring Property(MSIHANDLE session, const wchar_t* name) {
    DWORD size = 0;
    wchar_t empty[1]{};
    UINT result = MsiGetPropertyW(session, name, empty, &size);
    if (result != ERROR_SUCCESS && result != ERROR_MORE_DATA) throw std::runtime_error("property read");
    std::wstring value(static_cast<size_t>(size) + 1, L'\0');
    DWORD capacity = size + 1;
    if (MsiGetPropertyW(session, name, value.data(), &capacity) != ERROR_SUCCESS) throw std::runtime_error("property read");
    value.resize(capacity);
    return value;
}
std::wstring Normalize(const std::wstring& input) {
    if (input.size() < 3 || input[1] != L':' || input[2] != L'\\' ||
        !((input[0] >= L'A' && input[0] <= L'Z') || (input[0] >= L'a' && input[0] <= L'z')) ||
        input.find(L'|') != std::wstring::npos || input.find(L'/') != std::wstring::npos) {
        throw std::runtime_error("only local drive paths supported");
    }
    DWORD count = GetFullPathNameW(input.c_str(), 0, nullptr, nullptr);
    if (!count) throw std::runtime_error("path normalization");
    std::wstring value(count, L'\0');
    DWORD copied = GetFullPathNameW(input.c_str(), count, value.data(), nullptr);
    if (!copied || copied >= count) throw std::runtime_error("path normalization");
    value.resize(copied);
    while (value.size() > 3 && value.back() == L'\\') value.pop_back();
    return value;
}
bool Equal(const std::wstring& a, const std::wstring& b) {
    return CompareStringOrdinal(a.c_str(), -1, b.c_str(), -1, TRUE) == CSTR_EQUAL;
}
std::wstring KnownFolder(REFKNOWNFOLDERID id) {
    HANDLE rawToken = INVALID_HANDLE_VALUE;
    if (!OpenThreadToken(GetCurrentThread(), TOKEN_QUERY | TOKEN_IMPERSONATE, TRUE, &rawToken)) {
        if (GetLastError() != ERROR_NO_TOKEN || !OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY | TOKEN_IMPERSONATE, &rawToken)) throw std::runtime_error("current-user token");
    }
    Handle token(rawToken);
    PWSTR path = nullptr;
    HRESULT result = SHGetKnownFolderPath(id, KF_FLAG_DONT_VERIFY, token.value, &path);
    if (FAILED(result) || !path) { if (path) CoTaskMemFree(path); throw std::runtime_error("known folder"); }
    std::wstring value(path);
    CoTaskMemFree(path);
    return Normalize(value);
}
// OPEN_REPARSE_POINT plus per-component final-path checks reject stable junction/symlink/alias redirection.
// Handles are scoped to each check; concurrent replacement after a check remains a stated limitation.
bool CheckChain(const std::wstring& target) {
    bool exists = false;
    size_t end = 3;
    while (true) {
        const std::wstring prefix = target.substr(0, end);
        Handle handle(CreateFileW(prefix.c_str(), FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        if (handle.value == INVALID_HANDLE_VALUE) {
            DWORD error = GetLastError();
            if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) return false;
            throw std::runtime_error("cannot inspect directory chain");
        }
        FILE_ATTRIBUTE_TAG_INFO attributes{};
        if (!GetFileInformationByHandleEx(handle.value, FileAttributeTagInfo, &attributes, sizeof(attributes)) ||
            !(attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
            (attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
            throw std::runtime_error("directory reparse point or non-directory");
        }
        DWORD length = GetFinalPathNameByHandleW(handle.value, nullptr, 0, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
        if (!length) throw std::runtime_error("directory final path");
        std::wstring finalPath(static_cast<size_t>(length) + 1, L'\0');
        DWORD actual = GetFinalPathNameByHandleW(handle.value, finalPath.data(), length + 1, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
        if (!actual || actual > length) throw std::runtime_error("directory final path");
        finalPath.resize(actual);
        if (finalPath.rfind(L"\\\\?\\", 0) == 0) finalPath.erase(0, 4);
        if (!Equal(Normalize(finalPath), Normalize(prefix))) throw std::runtime_error("directory path redirected");
        exists = end == target.size();
        if (exists) return true;
        size_t next = target.find(L'\\', end + (end == 3 ? 0 : 1));
        end = next == std::wstring::npos ? target.size() : next;
    }
}
// Inspect every existing descendant without following links, including non-owned extras. Never enumerate data.
// A bounded refusal is safer than letting an enormous or malformed program tree bypass checks.
void CheckTree(const std::wstring& root) {
    std::vector<std::wstring> pending{root};
    size_t observed = 0;
    while (!pending.empty()) {
        const std::wstring directory = pending.back();
        pending.pop_back();
        if (!CheckChain(directory)) continue;
        WIN32_FIND_DATAW entry{};
        HANDLE search = FindFirstFileExW((directory + L"\\*").c_str(), FindExInfoBasic, &entry, FindExSearchNameMatch, nullptr, 0);
        if (search == INVALID_HANDLE_VALUE) {
            if (GetLastError() == ERROR_FILE_NOT_FOUND) continue;
            throw std::runtime_error("program directory enumeration");
        }
        try {
            do {
                if (wcscmp(entry.cFileName, L".") == 0 || wcscmp(entry.cFileName, L"..") == 0) continue;
                if (++observed > 100000) throw std::runtime_error("program tree budget");
                if (entry.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) throw std::runtime_error("linked program descendant");
                const std::wstring path = directory + L"\\" + entry.cFileName;
                if (entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) { pending.push_back(path); continue; }
                Handle file(CreateFileW(path.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
                BY_HANDLE_FILE_INFORMATION info{};
                if (file.value == INVALID_HANDLE_VALUE || !GetFileInformationByHandle(file.value, &info) ||
                    (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) || info.nNumberOfLinks != 1) throw std::runtime_error("linked or unreadable program file");
                DWORD length = GetFinalPathNameByHandleW(file.value, nullptr, 0, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
                if (!length) throw std::runtime_error("program final path");
                std::wstring finalPath(static_cast<size_t>(length) + 1, L'\0');
                DWORD actual = GetFinalPathNameByHandleW(file.value, finalPath.data(), length + 1, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
                if (!actual || actual > length) throw std::runtime_error("program final path");
                finalPath.resize(actual);
                if (finalPath.rfind(L"\\\\?\\", 0) == 0) finalPath.erase(0, 4);
                if (!Equal(Normalize(finalPath), Normalize(path))) throw std::runtime_error("program file redirected");
            } while (FindNextFileW(search, &entry));
            if (GetLastError() != ERROR_NO_MORE_FILES) throw std::runtime_error("program directory enumeration");
        } catch (...) { FindClose(search); throw; }
        FindClose(search);
    }
}
bool RegisteredOwner(const std::wstring& target) {
    for (DWORD index = 0;; ++index) {
        wchar_t code[39]{};
        UINT result = MsiEnumRelatedProductsW(UpgradeCode, 0, index, code);
        if (result == ERROR_NO_MORE_ITEMS) return false;
        if (result != ERROR_SUCCESS) throw std::runtime_error("related-product enumeration");
        if (MsiQueryProductStateW(code) != INSTALLSTATE_DEFAULT) continue;
        DWORD size = 0;
        result = MsiGetProductInfoExW(code, nullptr, MSIINSTALLCONTEXT_USERUNMANAGED,
            INSTALLPROPERTY_INSTALLLOCATION, nullptr, &size);
        if (result == ERROR_UNKNOWN_PRODUCT || result == ERROR_UNKNOWN_PROPERTY) continue;
        if (result != ERROR_SUCCESS && result != ERROR_MORE_DATA) throw std::runtime_error("installed-product location");
        std::wstring location(static_cast<size_t>(size) + 1, L'\0');
        DWORD capacity = size + 1;
        if (MsiGetProductInfoExW(code, nullptr, MSIINSTALLCONTEXT_USERUNMANAGED,
            INSTALLPROPERTY_INSTALLLOCATION, location.data(), &capacity) != ERROR_SUCCESS) throw std::runtime_error("installed-product location");
        location.resize(capacity);
        if (!location.empty() && Equal(Normalize(location), target)) return true;
    }
}
UINT Fail(MSIHANDLE session, const wchar_t* detail) {
    MSIHANDLE record = MsiCreateRecord(1);
    if (record) {
        MsiRecordSetStringW(record, 0, L"HDY_INSTALL_GUARD: [1] Close the workbench before maintenance. No files were intentionally removed by this guard.");
        MsiRecordSetStringW(record, 1, detail);
        MsiProcessMessage(session, INSTALLMESSAGE_ERROR, record);
        MsiCloseHandle(record);
    }
    return ERROR_INSTALL_FAILURE;
}
} // namespace

extern "C" __declspec(dllexport) UINT __stdcall ValidateInstallOwnership(MSIHANDLE session) {
    try {
        const std::wstring program = Normalize(KnownFolder(FOLDERID_LocalAppData) + L"\\Programs\\Haoduoyu\\NativeWorkbench");
        const std::wstring menu = Normalize(KnownFolder(FOLDERID_Programs) + L"\\Haoduoyu Native Workbench");
        if (!Equal(Normalize(Property(session, L"HdyInstallFolder")), program) ||
            !Equal(Normalize(Property(session, L"HdyStartMenuFolder")), menu)) {
            return Fail(session, L"The installation path differs from the independent current-user program directory.");
        }
        const bool programExists = CheckChain(program);
        const bool menuExists = CheckChain(menu);
        const bool owned = RegisteredOwner(program);
        if ((programExists || menuExists) && !owned) {
            return Fail(session, L"A pre-existing program or Start Menu directory is not owned by this installed MSI family. Keep it intact and choose a separate copy.");
        }
        if (programExists) CheckTree(program);
        if (menuExists) CheckTree(menu);
        // Only MSI properties are written. Windows Installer records the verified install location at registration.
        if (MsiSetPropertyW(session, L"ARPINSTALLLOCATION", program.c_str()) != ERROR_SUCCESS) throw std::runtime_error("ARP property");
        const std::wstring data = program + L"|" + menu + (owned ? L"|1" : L"|0");
        if (MsiSetPropertyW(session, L"HdyGuardBeforeRemove", data.c_str()) != ERROR_SUCCESS ||
            MsiSetPropertyW(session, L"HdyGuardBeforeInstall", (program + L"|" + menu + L"|1").c_str()) != ERROR_SUCCESS) throw std::runtime_error("guard script properties");
        return ERROR_SUCCESS;
    } catch (...) { return Fail(session, L"A program directory or ancestor cannot be safely inspected, is redirected, or is a reparse point. Leave existing files intact and restore the original directory before retrying."); }
}
extern "C" __declspec(dllexport) UINT __stdcall VerifyTransactionPaths(MSIHANDLE session) {
    try {
        const std::wstring data = Property(session, L"CustomActionData");
        const size_t first = data.find(L'|');
        const size_t second = first == std::wstring::npos ? first : data.find(L'|', first + 1);
        if (first == std::wstring::npos || second == std::wstring::npos || data.find(L'|', second + 1) != std::wstring::npos) throw std::runtime_error("guard data");
        const std::wstring program = Normalize(data.substr(0, first));
        const std::wstring menu = Normalize(data.substr(first + 1, second - first - 1));
        const std::wstring ownership = data.substr(second + 1);
        if (ownership != L"0" && ownership != L"1") throw std::runtime_error("guard ownership data");
        // Deferred actions impersonate this same user; never follow a directory redirected since the immediate gate.
        if (!Equal(program, Normalize(KnownFolder(FOLDERID_LocalAppData) + L"\\Programs\\Haoduoyu\\NativeWorkbench")) ||
            !Equal(menu, Normalize(KnownFolder(FOLDERID_Programs) + L"\\Haoduoyu Native Workbench"))) throw std::runtime_error("guard target data");
        const bool programExists = CheckChain(program);
        const bool menuExists = CheckChain(menu);
        if (programExists) CheckTree(program);
        if (menuExists) CheckTree(menu);
        if (ownership == L"0" && (programExists || menuExists)) return Fail(session, L"A previously absent installation directory appeared before the transaction; existing files will not be adopted.");
        return ERROR_SUCCESS;
    } catch (...) { return Fail(session, L"A program path became redirected or cannot be verified before file changes. The Windows Installer transaction must stop."); }
}
