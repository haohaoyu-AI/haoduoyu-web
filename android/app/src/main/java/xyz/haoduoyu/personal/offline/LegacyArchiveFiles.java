package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.UUID;

/** Verified app-private archives. Imported files are read-only and never become the active old database. */
public final class LegacyArchiveFiles implements LegacyMigrationCoordinator.Backup {
    public interface DirectorySync { void sync(File directory) throws Exception; }
    private final File directory;
    private final DirectorySync durableDirectory;

    public LegacyArchiveFiles(File privateDirectory, DirectorySync sync) {
        directory = privateDirectory; durableDirectory = sync;
    }

    @Override public synchronized void ensure(byte[] raw) throws Exception {
        prepare(directory);
        File pointer = new File(directory, "checkpoint.json");
        if (pointer.exists()) {
            JSONObject descriptor = new JSONObject(new String(read(pointer), StandardCharsets.UTF_8));
            String name = descriptor.optString("archive");
            if (!name.matches("recovery-[a-f0-9-]{36}\\.json")) throw new IOException("旧备份索引无效，未覆盖");
            LegacyArchive previous = LegacyArchive.decode(read(new File(directory, name)));
            if (!name.equals("recovery-" + previous.archiveId + ".json")
                    || !previous.payloadHash.equals(descriptor.optString("sha256"))) throw new IOException("旧备份校验失败，未覆盖");
            if (covers(previous.state(), LegacyArchive.state(raw))) return;
        }
        byte[] archive = LegacyArchive.encode(raw); LegacyArchive verified = LegacyArchive.decode(archive);
        String name = "recovery-" + verified.archiveId + ".json";
        atomic(new File(directory, name), archive, false);
        if (!Arrays.equals(raw, LegacyArchive.decode(read(new File(directory, name))).rawPayload()))
            throw new IOException("旧备份落盘核对失败；源数据库未更改");
        byte[] checkpoint = new JSONObject().put("archive", name).put("sha256", verified.payloadHash)
                .toString().getBytes(StandardCharsets.UTF_8);
        atomic(pointer, checkpoint, true);
    }

    /** Same archive ID and bytes are idempotent; collisions never replace a retained copy. */
    public synchronized File importReadOnly(byte[] archive) throws Exception {
        LegacyArchive verified = LegacyArchive.decode(archive);
        File imports = new File(directory, "imports"); prepare(directory); prepare(imports);
        File target = new File(imports, "import-" + verified.archiveId + ".json");
        if (target.exists()) {
            if (!Arrays.equals(read(target), archive)) throw new IOException("同一备份身份的内容不同；原只读副本保留");
            return target;
        }
        atomic(target, archive, false);
        if (!Arrays.equals(read(target), archive)) throw new IOException("只读导入核验失败");
        return target;
    }

    private void prepare(File path) throws Exception {
        if (!path.isDirectory() && !path.mkdirs()) throw new IOException("无法建立本机私有备份目录");
        if (!path.setReadable(false, false) || !path.setWritable(false, false)
                || !path.setExecutable(false, false) || !path.setReadable(true, true)
                || !path.setWritable(true, true) || !path.setExecutable(true, true)) throw new IOException("私有备份目录权限未确认");
    }

    private void atomic(File target, byte[] bytes, boolean replace) throws Exception {
        File parent = target.getParentFile(), temp = new File(parent, ".writing-" + UUID.randomUUID());
        try {
            if (!temp.createNewFile()) throw new IOException("无法创建私有备份暂存文件");
            if (!temp.setReadable(false, false) || !temp.setWritable(false, false)
                    || !temp.setReadable(true, true) || !temp.setWritable(true, true)) throw new IOException("私有文件权限未确认");
            try (FileOutputStream output = new FileOutputStream(temp)) { output.write(bytes); output.getFD().sync(); }
            if (!replace && target.exists()) throw new IOException("备份已存在，未覆盖");
            if (replace) Files.move(temp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            else Files.move(temp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
            durableDirectory.sync(parent);
        } finally { if (temp.exists() && !temp.delete()) temp.deleteOnExit(); }
    }
    private static byte[] read(File file) throws IOException {
        try (FileInputStream input = new FileInputStream(file)) { return LegacyArchive.readBounded(input); }
    }

    // Engine acknowledgements remove operations without changing their original payloads.
    // Reuse the original archive across passes; new local operations/drafts require a new backup.
    private static boolean covers(JSONObject saved, JSONObject current) throws Exception {
        if (!JsonUtil.equal(saved.opt("workspace"), current.opt("workspace"))) return false;
        JSONObject savedDrafts = saved.optJSONObject("drafts"), drafts = current.optJSONObject("drafts");
        if (drafts != null) for (String key : JsonUtil.keys(drafts)) {
            if (savedDrafts == null || !savedDrafts.has(key) || !JsonUtil.equal(savedDrafts.opt(key), drafts.opt(key))) return false;
        }
        JSONArray old = saved.optJSONArray("operations"), operations = current.optJSONArray("operations");
        if (operations == null || old == null) return false;
        for (int i = 0; i < operations.length(); i++) {
            JSONObject operation = operations.getJSONObject(i), original = null;
            for (int j = 0; j < old.length(); j++) if (operation.optString("op_id").equals(old.getJSONObject(j).optString("op_id"))) {
                original = old.getJSONObject(j); break;
            }
            if (original == null || !JsonUtil.equal(operation.opt("payload"), original.opt("payload"))) return false;
        }
        return true;
    }
}
