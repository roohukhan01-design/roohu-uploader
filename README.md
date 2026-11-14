# Roohu GitHub Uploader

Android app (Capacitor 6 + Java native plugin) for uploading phone files into GitHub repository folders.

## Build an APK with GitHub Actions
1. Create a GitHub OAuth App at `github.com/settings/developers` and enable **Device Flow**.
2. Push this project to a GitHub repository on the `main` branch.
3. Open **Actions → Build APK** (or run it manually) and download the `roohu-github-uploader-apk` artifact.
4. Install `app-debug.apk`. In the app, enter the OAuth Client ID and approve the device code in the browser.

## Included
- GitHub Device Flow sign-in; token encryption using Android Keystore.
- Repository, branch and folder browsing.
- Multi-file picker, APK detection, filename options and conflict handling.
- Upload queue, progress/speed/ETA, retry, cancellation and upload history.
- Android foreground notification while the upload page is active.
- Interrupted queue entries can be restored by selecting the exact same files again (same name and size).

## Important technical limits
- Uploads use GitHub's Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`), which has a 100 MB per-file limit. This app blocks files above 100 MB.
- The API request must contain the file as Base64. The app reads small chunks while preparing the request, but the final Base64 JSON body still occupies memory. Large APKs can therefore use substantial RAM; files over 25 MB show a warning.
- The foreground service provides a notification and wake lock, but the actual HTTP request is run by the WebView JavaScript. Android may terminate the WebView/app process; this is **not** a guaranteed native, restart-resumable background transfer. Keep the app open for best reliability.
- After an app restart, Android file-picker handles are not retained. Use **Select files to restore** in the queue and choose the same files again.
- OAuth Device Flow uses a public Client ID. Never paste a client secret or personal access token into the app.
- The included workflow creates a debug-signed APK. A production release needs a signing configuration.

## Verification status
Source-level checks can be run with `node --check www/app.js` and `python3 -m py_compile scripts/patch-android.py`. A successful GitHub Actions run and real-device OAuth/upload test are still required before calling the APK release-ready.

## Build the APK yourself (Windows/Mac/Linux)
Needs Node 20, JDK 17 and the Android SDK (Android Studio installs it).
```
npm install
npx cap add android
python3 scripts/patch-android.py
npx cap sync android
cd android && ./gradlew assembleDebug      # Windows: gradlew.bat assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
You can also open the `android` folder in Android Studio and press Run.
