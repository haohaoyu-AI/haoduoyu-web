package xyz.haoduoyu.personal.offline;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.Future;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** System scheduled work; a force-stop intentionally remains an Android stop. */
public final class SyncJobService extends JobService {
    private static final java.util.Set<Integer> ACTIVE = java.util.concurrent.ConcurrentHashMap.newKeySet();
    static boolean isActive(int id){return ACTIVE.contains(id);}
    private final Map<Integer, Task> tasks = new HashMap<>();
    private final ExecutorService bootstrap = Executors.newSingleThreadExecutor();
    private static final class Task { volatile Future<?> future; Future<?> startup; volatile boolean stopped; }
    @Override public boolean onStartJob(JobParameters parameters) {
        ACTIVE.add(parameters.getJobId());
        Task task = new Task();
        tasks.put(parameters.getJobId(), task);
        task.startup=bootstrap.submit(()->{
            try {
                if(task.stopped)return;
                task.future = OfflineRuntime.get(this).runJob(() -> {
                    if (!task.stopped && tasks.get(parameters.getJobId()) == task) {
                        tasks.remove(parameters.getJobId());ACTIVE.remove(parameters.getJobId());jobFinished(parameters, false);
                    }
                });
                if(task.stopped)task.future.cancel(true);
            }catch(Exception unavailable){new android.os.Handler(getMainLooper()).post(()->{if(!task.stopped){tasks.remove(parameters.getJobId());ACTIVE.remove(parameters.getJobId());jobFinished(parameters,true);}});}
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        ACTIVE.remove(parameters.getJobId());
        Task task = tasks.remove(parameters.getJobId());
        if (task != null) { task.stopped = true; if(task.startup!=null)task.startup.cancel(true);if (task.future != null) task.future.cancel(true); }
        return true;
    }
    @Override public void onDestroy(){for(Integer id:tasks.keySet())ACTIVE.remove(id);for(Task task:tasks.values()){task.stopped=true;if(task.startup!=null)task.startup.cancel(true);if(task.future!=null)task.future.cancel(true);}tasks.clear();bootstrap.shutdownNow();super.onDestroy();}
}
