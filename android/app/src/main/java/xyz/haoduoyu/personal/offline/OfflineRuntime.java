package xyz.haoduoyu.personal.offline;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Handler;
import android.os.Looper;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.json.JSONObject;

/** Process-wide ownership: UI storage writes never wait behind network requests. */
public final class OfflineRuntime {
    private static OfflineRuntime instance;
    private static Supplier<ApiClient.Transport> transportFactory = AndroidApiTransport::new;
    private static final int PERIODIC_JOB = 27260, RECOVERY_JOB = 27261;
    public final LocalRepository repository;
    public final ApiClient api;
    public final ExecutorService local = Executors.newSingleThreadExecutor();
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean again = new AtomicBoolean();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Runnable> listeners = new CopyOnWriteArraySet<>();
    private final ConcurrentHashMap<String, Draft> pendingDrafts = new ConcurrentHashMap<>();
    private final AtomicBoolean drainingDrafts = new AtomicBoolean();
    private static final class Draft { final String text; final Runnable failed; Draft(String text,Runnable failed){this.text=text;this.failed=failed;} }
    private final Context context;

    private OfflineRuntime(Context source) throws Exception {
        context = source.getApplicationContext();
        repository = new LocalRepository(new SqliteStateStore(context));
        api = new ApiClient(transportFactory.get());
        schedulePeriodic();
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity != null) connectivity.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { requestSync(); }
        });
    }

    public static synchronized OfflineRuntime get(Context context) throws Exception {
        if (instance == null) instance = new OfflineRuntime(context);
        return instance;
    }

    public void listen(Runnable listener) { listeners.add(listener); }
    public void unlisten(Runnable listener) { listeners.remove(listener); }
    public void changed() { for (Runnable listener : listeners) main.post(listener); }

    /** Keep only the latest unsaved text per editor, while preserving FIFO with committed actions. */
    public void queueDraft(String slot, String value, Runnable failed) {
        pendingDrafts.put(slot,new Draft(value,failed));
        drainDrafts();
    }
    private void drainDrafts(){
        if(!drainingDrafts.compareAndSet(false,true))return;
        local.execute(()->{
            try{
                while(!pendingDrafts.isEmpty())for(String key:pendingDrafts.keySet()){
                    Draft draft=pendingDrafts.remove(key);if(draft==null)continue;
                    try{repository.setDraft(key,draft.text);}catch(Exception failure){if(draft.failed!=null)main.post(draft.failed);}
                }
            }finally{
                drainingDrafts.set(false);
                if(!pendingDrafts.isEmpty())drainDrafts();
            }
        });
    }

    public void requestSync() {
        scheduleRecovery(5000);
        again.set(true);
        if (!running.compareAndSet(false, true)) return;
        network.execute(() -> {
            try {
                for (int pass = 0; pass < 2 && again.getAndSet(false); pass++) performSync();
            } finally {
                running.set(false);
                changed();
                if (again.get()) scheduleRecovery(10000);
            }
        });
    }

    private void performSync() {
        if (!LegacyMigrationCoordinator.OWNER.tryAcquire()) { scheduleRecovery(30000); return; }
        try { performOwnedSync(); }
        finally { LegacyMigrationCoordinator.OWNER.release(); }
    }

    private void performOwnedSync() {
        try {
            JSONObject state = repository.snapshot();
            JSONObject status = state.optJSONObject("status");
            if (status != null && status.optLong("retry_at", 0) > System.currentTimeMillis()) {
                scheduleRecovery(status.optLong("retry_at") - System.currentTimeMillis());
                return;
            }
            // A fresh or upgraded database still discovers the explicit public identity.
            new SyncEngine(repository, new ApiClient(transportFactory.get())).run();
            JSONObject after = repository.snapshot().optJSONObject("status");
            if (after != null && after.optLong("retry_at", 0) > 0) {
                scheduleRecovery(Math.max(5000, after.optLong("retry_at") - System.currentTimeMillis()));
            }
        } catch (Exception failure) {
            try { repository.status("retry", "同步暂未完成，本机内容保留，稍后重试", System.currentTimeMillis() + 60000); }
            catch (Exception ignored) { /* Do not erase a database that cannot currently be written. */ }
            scheduleRecovery(60000);
        } finally { changed(); }
    }

    public Future<?> runJob(Runnable finished) {
        return network.submit(() -> {
            try { performSync(); }
            finally { main.post(()->{finished.run();JSONObject status=repository.snapshot().optJSONObject("status");if(status!=null&&status.optLong("retry_at",0)>0)scheduleRecovery(Math.max(5000,status.optLong("retry_at")-System.currentTimeMillis()));}); }
        });
    }

    private void schedulePeriodic() {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        if(scheduler.getPendingJob(PERIODIC_JOB)!=null)return;
        JobInfo work = new JobInfo.Builder(PERIODIC_JOB, new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true).build();
        scheduler.schedule(work);
    }

    private void scheduleRecovery(long delay) {
        // Replacing a running job with its own ID would stop/cancel this very sync.
        if(SyncJobService.isActive(RECOVERY_JOB))return;
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        JobInfo work = new JobInfo.Builder(RECOVERY_JOB, new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(Math.max(5000, delay))
                .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setPersisted(true).build();
        scheduler.schedule(work);
    }
}
