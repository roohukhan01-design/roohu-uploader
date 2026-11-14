"""Run after `npx cap add android`: installs the native plugin/service and manifest entries."""
import pathlib, shutil

root = pathlib.Path("android/app/src/main")
pkg = root / "java/com/roohu/githubuploader"
pkg.mkdir(parents=True, exist_ok=True)
for f in pathlib.Path("native").glob("*.java"):
    shutil.copy(f, pkg / f.name)

m = root / "AndroidManifest.xml"
t = m.read_text()
perms = """    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
"""
if "FOREGROUND_SERVICE_DATA_SYNC" not in t:
    t = t.replace("<application", perms + "\n    <application", 1)
if "UploadService" not in t:
    t = t.replace("</application>",
        '    <service android:name=".UploadService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>', 1)
m.write_text(t)
print("Patched", m)
