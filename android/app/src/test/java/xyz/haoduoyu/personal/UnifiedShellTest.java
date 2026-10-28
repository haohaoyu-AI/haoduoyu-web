package xyz.haoduoyu.personal;

import android.app.job.JobScheduler;
import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ServiceWorkerController;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerWebSettings;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.Implementation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.SqliteStateStore;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, shadows = UnifiedShellTest.ServiceWorkers.class)
@LooperMode(LooperMode.Mode.PAUSED)
public final class UnifiedShellTest {
    /** Robolectric's WebView provider has no ServiceWorkerController; retain the actual app configuration calls. */
    @Implements(ServiceWorkerController.class)
    public static final class ServiceWorkers {
        private static final WorkerController CONTROLLER = new WorkerController();
        @Implementation protected static ServiceWorkerController getInstance() { return CONTROLLER; }
    }
    private static final class WorkerController extends ServiceWorkerController {
        private final ServiceWorkerWebSettings settings = new ServiceWorkerWebSettings() {
            private int cache; private boolean content, files, blocked;
            public void setCacheMode(int value) { cache = value; } public int getCacheMode() { return cache; }
            public void setAllowContentAccess(boolean value) { content = value; } public boolean getAllowContentAccess() { return content; }
            public void setAllowFileAccess(boolean value) { files = value; } public boolean getAllowFileAccess() { return files; }
            public void setBlockNetworkLoads(boolean value) { blocked = value; } public boolean getBlockNetworkLoads() { return blocked; }
        };
        @Override public ServiceWorkerWebSettings getServiceWorkerWebSettings() { return settings; }
        @Override public void setServiceWorkerClient(ServiceWorkerClient client) { fail("No native service worker interceptor is allowed"); }
    }
    private ActivityController<MainActivity> controller;
    @Before public void isolate() throws Exception { resetRuntime(); }
    @After public void close() throws Exception {
        if (controller != null) controller.pause().stop().destroy();
        resetRuntime(); Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    private static Field field(Class<?> type, String name) throws Exception { Field value=type.getDeclaredField(name);value.setAccessible(true);return value; }
    private static void resetRuntime() throws Exception {
        Field singleton=field(LegacyRecoveryRuntime.class,"instance"); Object runtime=singleton.get(null);
        if(runtime!=null){
            android.os.Handler main=(android.os.Handler)field(LegacyRecoveryRuntime.class,"main").get(runtime);main.removeCallbacksAndMessages(null);
            ExecutorService worker=(ExecutorService)field(LegacyRecoveryRuntime.class,"worker").get(runtime);worker.shutdownNow();worker.awaitTermination(10,TimeUnit.SECONDS);
            SqliteStateStore source=(SqliteStateStore)field(LegacyRecoveryRuntime.class,"source").get(runtime);if(source!=null)source.close();
        }
        singleton.set(null,null);
    }
    @Test public void launcherUsesOneWebsiteAndPersistentWebStorageWithoutInitializingAnOldDatabase() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        Intent launcher=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launcher);assertEquals(MainActivity.class.getName(),launcher.getComponent().getClassName());
        controller=Robolectric.buildActivity(MainActivity.class).setup(); MainActivity activity=controller.get();
        WebView web=(WebView)field(MainActivity.class,"web").get(activity);
        assertEquals(UrlPolicy.HOME,Shadows.shadowOf(web).getLastLoadedUrl());
        assertTrue(web.getSettings().getJavaScriptEnabled());assertTrue(web.getSettings().getDomStorageEnabled());
        assertFalse(web.getSettings().getAllowFileAccess());assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,web.getSettings().getMixedContentMode());
        ServiceWorkerWebSettings workers=ServiceWorkerController.getInstance().getServiceWorkerWebSettings();
        assertEquals(WebSettings.LOAD_DEFAULT,workers.getCacheMode());assertFalse(workers.getAllowFileAccess());
        assertFalse(workers.getAllowContentAccess());assertFalse(workers.getBlockNetworkLoads());
        assertFalse(context.getDatabasePath("haoduoyu-offline.db").exists());
        JobScheduler jobs=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        assertNull(jobs.getPendingJob(27260));assertNull(jobs.getPendingJob(27261));
        assertEquals("3.0.1-debug",BuildConfig.VERSION_NAME);assertEquals(5,BuildConfig.VERSION_CODE);
    }
    @Test public void fixedNativeEventsAreNotEvaluatedWhenTheCurrentTopLevelDocumentIsForeign() throws Exception {
        controller=Robolectric.buildActivity(MainActivity.class).setup();MainActivity activity=controller.get();
        WebView web=(WebView)field(MainActivity.class,"web").get(activity);
        Method emit=MainActivity.class.getDeclaredMethod("emitNative",String.class);emit.setAccessible(true);
        web.loadUrl(UrlPolicy.HOME);emit.invoke(activity,NativeBridgeScripts.online());
        assertEquals(NativeBridgeScripts.online(),Shadows.shadowOf(web).getLastEvaluatedJavascript());
        web.loadUrl("https://foreign.invalid/");String previous=Shadows.shadowOf(web).getLastEvaluatedJavascript();
        emit.invoke(activity,NativeBridgeScripts.legacy(17,2,true));
        assertEquals(previous,Shadows.shadowOf(web).getLastEvaluatedJavascript());
    }
}
