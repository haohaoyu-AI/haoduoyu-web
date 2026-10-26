package xyz.haoduoyu.personal.offline;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Immutable app-private restored drafts. Neither a SQLite store nor a migration/outbox input. */
public final class LegacyRestoredDraftFiles {
    private static final Object OWNER = new Object();
    private final File directory;
    private final LegacyArchiveFiles.DirectorySync durableDirectory;
    public LegacyRestoredDraftFiles(File privateDirectory, LegacyArchiveFiles.DirectorySync sync) {
        if (privateDirectory == null || sync == null) throw new IllegalArgumentException("Private directory and durability check required");
        directory = privateDirectory.getAbsoluteFile(); durableDirectory = sync;
        if (directory.getParentFile() == null) throw new IllegalArgumentException("A private subdirectory is required");
    }

    /** Repeated content keeps the first recovery timestamp, but still rechecks directory durability and bytes. */
    public LegacyRestoredDraft save(LegacyRestoredDraft record) throws Exception {
        if (record == null) throw new IllegalArgumentException("Recovery record required");
        synchronized (OWNER) {
            prepare(directory, 0); File target = new File(directory, "restored-" + record.recoveryId + ".json");
            if (Files.exists(target.toPath(), LinkOption.NOFOLLOW_LINKS)) return existing(target, record);
            byte[] bytes = record.encode(); File pending = new File(directory, ".writing-" + UUID.randomUUID());
            try {
                if (!pending.createNewFile()) throw new IOException("无法创建恢复记录暂存文件"); privateFile(pending);
                try (FileOutputStream output = new FileOutputStream(pending)) { output.write(bytes); output.getFD().sync(); }
                Files.move(pending.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
                durableDirectory.sync(directory);
                byte[] readback = read(target);
                if (!Arrays.equals(bytes, readback)) throw new IOException("恢复记录落盘核对失败；未确认保存");
                return checked(target, LegacyRestoredDraft.decode(readback));
            } finally { if (pending.exists() && !pending.delete()) pending.deleteOnExit(); }
        }
    }
    private LegacyRestoredDraft existing(File target, LegacyRestoredDraft wanted) throws Exception {
        LegacyRestoredDraft before = checked(target, LegacyRestoredDraft.decode(read(target)));
        if (!before.recoveryId.equals(wanted.recoveryId)) throw new IOException("恢复记录身份不匹配；未覆盖");
        durableDirectory.sync(directory);
        byte[] retained = read(target);
        if (!Arrays.equals(before.encode(), retained)) throw new IOException("恢复记录在核对期间改变；未确认保存");
        return checked(target, LegacyRestoredDraft.decode(retained));
    }

    public List<LegacyRestoredDraft> list() throws Exception {
        synchronized (OWNER) {
            if (!Files.exists(directory.toPath(), LinkOption.NOFOLLOW_LINKS)) return Collections.emptyList();
            if (Files.isSymbolicLink(directory.toPath()) || !directory.isDirectory()) throw new IOException("恢复目录无效");
            File[] children = directory.listFiles(); if (children == null) throw new IOException("无法读取恢复记录目录");
            List<LegacyRestoredDraft> records = new ArrayList<>();
            for (File child : children) {
                if (child.getName().matches("\\.writing-[a-f0-9-]{36}")) continue;
                if (!child.getName().matches("restored-[a-f0-9]{64}\\.json")) throw new IOException("恢复目录包含无法识别的记录");
                records.add(checked(child, LegacyRestoredDraft.decode(read(child))));
            }
            records.sort(Comparator.comparing((LegacyRestoredDraft value) -> Instant.parse(value.recoveredAt)).thenComparing(value -> value.recoveryId));
            return Collections.unmodifiableList(records);
        }
    }
    private void prepare(File path, int depth) throws Exception {
        if (depth > 128 || Files.isSymbolicLink(path.toPath())) throw new IOException("恢复目录无效或为符号链接");
        boolean created = !path.exists();
        File parent = path.getParentFile();
        if (parent == null) throw new IOException("恢复目录缺少私有父目录");
        if (created) {
            // Do not create a child until its parent's entry is durable. A retry can therefore
            // restart from the deepest existing directory even after a previous process ended.
            prepare(parent, depth + 1);
            if (!path.mkdir()) throw new IOException("无法建立本机私有恢复目录");
        }
        if (!path.isDirectory()) throw new IOException("恢复目录不是目录");
        if (created || path.equals(directory)) {
            if (!path.setReadable(false, false) || !path.setWritable(false, false) || !path.setExecutable(false, false)
                    || !path.setReadable(true, true) || !path.setWritable(true, true) || !path.setExecutable(true, true))
                throw new IOException("恢复目录私有权限未确认");
        }
        // This also runs for existing directories: an earlier mkdir/rename may have failed fsync.
        durableDirectory.sync(parent);
    }
    private static void privateFile(File file) throws IOException {
        if (!file.setReadable(false, false) || !file.setWritable(false, false) || !file.setReadable(true, true) || !file.setWritable(true, true))
            throw new IOException("恢复记录私有权限未确认");
    }
    private static LegacyRestoredDraft checked(File file, LegacyRestoredDraft record) throws IOException {
        if (!file.getName().equals("restored-" + record.recoveryId + ".json")) throw new IOException("恢复记录文件身份不匹配"); return record;
    }
    private static byte[] read(File file) throws IOException {
        if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("恢复记录不是私有普通文件");
        if (file.length() > LegacyRestoredDraft.MAX_RECORD_BYTES) throw new IOException("恢复记录超过支持容量");
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
                if ((long) output.size() + count > LegacyRestoredDraft.MAX_RECORD_BYTES) throw new IOException("恢复记录超过支持容量");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }
}
