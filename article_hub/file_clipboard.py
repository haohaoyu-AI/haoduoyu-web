"""Copy validated topic files to the Windows file-drop clipboard."""
import json
import subprocess
import sys
import uuid
from pathlib import Path


def copy_topic_files(names, root: Path, allowed) -> int:
    if not isinstance(names, list) or not 1 <= len(names) <= 100:
        raise ValueError('请选择本批提示词文件')
    root = root.resolve()
    allowed = {Path(name).resolve() for name in allowed}
    source_paths = []
    for name in names:
        if not isinstance(name, str):
            raise ValueError('文件路径格式不正确')
        path = Path(name).resolve()
        if path not in allowed or not path.is_relative_to(root) or path.suffix.lower() != '.md' or not path.is_file():
            raise ValueError('选题文件已变化，请刷新列表后重试；未复制任何文件')
        if path not in source_paths:
            source_paths.append(path)
    if sys.platform != 'win32':
        raise ValueError('文件复制功能需要 Windows')
    # The review files also carry local status metadata.  Build dedicated
    # handoff files containing only the article brief so image keywords and
    # internal package details never travel to the writing service.
    from .topics import brain_brief_from_document
    briefs = []
    for source in source_paths:
        brief = brain_brief_from_document(source.read_text(encoding='utf-8')).strip()
        if not brief:
            raise ValueError(f'选题文件没有可复制的文章提示词：{source.name}')
        briefs.append((source, brief))
    handoff_dir = root / '.得到大脑交接'
    handoff_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for source, brief in briefs:
        target = handoff_dir / source.name
        temporary = target.with_name(f'.{target.name}.{uuid.uuid4().hex}.tmp')
        try:
            temporary.write_text(brief + '\n', encoding='utf-8')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        paths.append(str(target))
    # Paths travel as JSON data, never as executable PowerShell source.
    script = "$ErrorActionPreference='Stop'; [string[]]$paths=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd()); Set-Clipboard -LiteralPath $paths"
    result = subprocess.run(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-Command', script],
        input=json.dumps(paths, ensure_ascii=True), text=True,
        capture_output=True, timeout=15, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise ValueError('文件剪贴板写入失败，可能被其他程序占用，请重试')
    return len(paths)
