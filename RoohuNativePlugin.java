package com.roohu.githubuploader;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PluginMethod;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(
    name = "RoohuNative",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class RoohuNativePlugin extends Plugin {
    private static final String ALIAS = "roohu_token_key";
    private static final String PREFS = "roohu_secure";

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
            g.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = c.doFinal(call.getString("value", "").getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            prefs().edit().putString(call.getString("key"), packed).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Secure storage failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        JSObject out = new JSObject();
        try {
            String packed = prefs().getString(call.getString("key"), null);
            if (packed != null) {
                String[] p = packed.split(":");
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
                out.put("value", new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            // Key invalidated or data corrupt: treat as signed out.
        }
        call.resolve(out);
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        prefs().edit().remove(call.getString("key")).apply();
        call.resolve();
    }

    private void resolveNotif(PluginCall call) {
        JSObject o = new JSObject();
        o.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(o);
    }

    @PluginMethod
    public void notifStatus(PluginCall call) {
        resolveNotif(call);
    }

    @PluginMethod
    public void notifRequest(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifCallback");
        } else {
            resolveNotif(call);
        }
    }

    @PermissionCallback
    private void notifCallback(PluginCall call) {
        resolveNotif(call);
    }

    @PluginMethod
    public void service(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(ctx, UploadService.class);
        if ("stop".equals(call.getString("action", "update"))) {
            ctx.stopService(i);
        } else {
            i.putExtra("title", call.getString("title", "Uploading"));
            i.putExtra("text", call.getString("text", ""));
            i.putExtra("progress", call.getInt("progress", -1));
            ContextCompat.startForegroundService(ctx, i);
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyDone(PluginCall call) {
        UploadService.done(getContext(), call.getString("title", "Upload finished"), call.getString("text", ""));
        call.resolve();
    }
}
