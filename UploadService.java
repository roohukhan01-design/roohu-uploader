package com.roohu.githubuploader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Keeps the process alive and shows progress while files upload in the background. */
public class UploadService extends Service {
    static final String CH = "roohu_uploads";
    static final String CH_DONE = "roohu_results";
    private PowerManager.WakeLock wl;

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CH, "Upload progress", NotificationManager.IMPORTANCE_LOW));
            nm.createNotificationChannel(new NotificationChannel(CH_DONE, "Upload results", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }

    static PendingIntent open(Context c) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        channels(this);
        String title = i != null && i.getStringExtra("title") != null ? i.getStringExtra("title") : "Uploading";
        String text = i != null && i.getStringExtra("text") != null ? i.getStringExtra("text") : "";
        int p = i != null ? i.getIntExtra("progress", -1) : -1;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(title).setContentText(text)
            .setContentIntent(open(this)).setOngoing(true).setOnlyAlertOnce(true);
        if (p >= 0) b.setProgress(100, p, false); else b.setProgress(0, 0, true);
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(1, n);
        if (wl == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "roohu:upload");
            wl.acquire(6 * 60 * 60 * 1000L);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wl != null && wl.isHeld()) wl.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    static void done(Context c, String title, String text) {
        channels(c);
        try {
            Notification n = new NotificationCompat.Builder(c, CH_DONE)
                .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                .setContentTitle(title).setContentText(text)
                .setContentIntent(open(c)).setAutoCancel(true).build();
            NotificationManagerCompat.from(c).notify(2, n);
        } catch (SecurityException ignored) { }
    }
}
