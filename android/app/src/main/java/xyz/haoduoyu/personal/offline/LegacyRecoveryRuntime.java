package xyz.haoduoyu.personal.offline;

import android.app.job.JobScheduler;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.system.Os;
import android.system.OsConstants;

import org.json.JSONObject;

import java.io.File;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Foreground legacy recovery only. New edits and their outbox belong exclusively to the shared website. */
public final class LegacyRecoveryRuntime {
    private static LegacyRecoveryRuntime instance;
    private static Supplier<ApiClient.Transport> transportFactory = AndroidApiTransport::new;
    private final Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Runnable> listeners = new CopyOnWriteArraySet<>();
    private final AtomicBoolean running = new AtomicBoolean(), again = new AtomicBoolean();
    private final LegacyArchiveFiles archives;
    private SqliteStateStore source;
    private volatile LegacyMigrationCoordinator.Result result;
    public interface Callback<T> { void finished(T value, Exception failure); }

    private LegacyRecoveryRuntime(Context supplied) {
        context = supplied.getApplicationContext(); cancelOldJobs(context);
        archives = new LegacyArchiveFiles(new File(context.getNoBackupFilesDir(), "legacy-recovery"), directory -> {
            FileDescriptor descriptor = Os.open(directory.getAbsolutePath(), OsConstants.O_RDONLY | OsConstants.O_DIRECTORY, 0);
            try { Os.fsync(descriptor); } finally { Os.close(descriptor); }
        });
    }
    public static synchronized LegacyRecoveryRuntime get(Context context) {
        if (instance == null) instance = new LegacyRecoveryRuntime(context);
        return instance;
    }
    public static void cancelOldJobs(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler != null) { scheduler.cancel(27260); scheduler.cancel(27261); }
    }
    public boolean hasLegacyDatabase() { return context.getDatabasePath("haoduoyu-offline.db").isFile(); }
    public LegacyMigrationCoordinator.Result result() { return result; }
    public void listen(Runnable listener) { listeners.add(listener); }
    public void unlisten(Runnable listener) { listeners.remove(listener); }

    public void request() {
        if (!hasLegacyDatabase()) return;
        again.set(true); if (!running.compareAndSet(false, true)) return;
        worker.execute(() -> {
            again.set(false);
            try {
                ApiClient api = new ApiClient(transportFactory.get());
                result = new LegacyMigrationCoordinator().run(store(), archives, () -> {
                    JSONObject me = api.me(), index = api.object("GET", ApiClient.PREFIX + "/workbench-snapshot/index", null);
                    if (!ApiClient.isPublicBusiness(me) || !Boolean.TRUE.equals(index.opt("complete"))
                            || !"haoduoyu-workbench-snapshot-v1".equals(index.optString("snapshot_format")))
                        throw new IOException("未核实原公开工作台");
                    return new JSONObject().put("origin", ApiClient.ORIGIN).put("scope_id", index.getString("scope_id"))
                            .put("public_business", true);
                }, repository -> new SyncEngine(repository, api).run());
            } catch (Exception unavailable) {
                result = new LegacyMigrationCoordinator.Result("paused", "旧版本机状态暂不可核对；原库保留，可导出原始文件", null, false);
            } catch (OutOfMemoryError budget) {
                result = new LegacyMigrationCoordinator.Result("paused", "旧状态超出本机当前内存预算；原库保留，可导出原始文件", null, false);
            } finally {
                running.set(false);
                for (Runnable listener : listeners) main.post(listener);
                if (again.get()) main.post(this::request);
                else if (!listeners.isEmpty() && result != null && result.pending > 0 && "retained".equals(result.code)) {
                    main.postDelayed(() -> { if (!listeners.isEmpty()) request(); }, 30000);
                }
            }
        });
    }
    private synchronized SqliteStateStore store() throws IOException {
        if (!hasLegacyDatabase()) throw new IOException("没有旧数据库；未创建空替代库");
        if (source == null) source = new SqliteStateStore(context);
        return source;
    }
    public <T> void submit(Callable<T> task, Callback<T> callback) {
        worker.execute(() -> {
            T value = null; Exception failure = null;
            try { value = task.call(); }
            catch (Exception error) { failure = error; }
            catch (OutOfMemoryError budget) { failure = new IOException("内容超出当前内存预算，原库保留，请导出原始文件"); }
            final T ready = value; final Exception problem = failure; main.post(() -> callback.finished(ready, problem));
        });
    }
    public byte[] currentArchive() throws Exception {
        byte[] raw = store().readRawPayload();
        if (raw == null) throw new IOException("旧数据库没有可验证的状态，原文件保留");
        return LegacyArchive.encode(raw);
    }
    public File retainImportedArchive(byte[] archive) throws Exception { return archives.importReadOnly(archive); }

    /** Explicit local export only; includes retained WAL/SHM/journal files if corruption prevented opening. */
    public void exportOriginalFiles(OutputStream destination) throws Exception {
        if (!LegacyMigrationCoordinator.OWNER.tryAcquire()) throw new IOException("旧记录正在核对，请稍后导出原文件");
        try (ZipOutputStream zip = new ZipOutputStream(destination)) {
            File database = context.getDatabasePath("haoduoyu-offline.db"); boolean found = false;
            for (String suffix : new String[]{"", "-wal", "-shm", "-journal"}) {
                File file = new File(database.getPath() + suffix); if (!file.isFile()) continue;
                zip.putNextEntry(new ZipEntry("haoduoyu-offline.db" + suffix));
                try (FileInputStream input = new FileInputStream(file)) {
                    byte[] bytes = new byte[8192]; int count;
                    while ((count = input.read(bytes)) != -1) zip.write(bytes, 0, count);
                }
                zip.closeEntry(); found = true;
            }
            if (!found) throw new IOException("未发现旧库文件，没有创建空替代库");
        } finally { LegacyMigrationCoordinator.OWNER.release(); }
    }
}
