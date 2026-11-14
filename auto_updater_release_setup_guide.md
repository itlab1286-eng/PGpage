# Elysium PG — Over-The-Air (OTA) App Auto-Updater Guide

This document explains how the self-hosted Over-The-Air (OTA) update system works for the **Elysium PG** Android app (`com.elysium.pg`) and provides the exact checklist for publishing future app updates over the internet.

---

## 1. How the Architecture Works

Your app uses a **hybrid two-tier update system**:

1. **Frontend / Web Logic Updates (Zero APK Required):**
   * Any edits to HTML, CSS, JavaScript, or Google Apps Script (`rent.html`, `new_resident.html`, `auth.js`, `code.gs`, etc.) take effect **immediately** when pushed to GitHub Pages or deployed in Apps Script.
   * **Do NOT** build a new APK for web UI or calculation changes.

2. **Native Android App Updates (OTA APK Auto-Updater):**
   * Only required when you modify native Android files (`MainActivity.kt`, `AndroidManifest.xml`, `build.gradle.kts`, biometric bridge, notifications, etc.).
   * On startup, `MainActivity.kt` fetches `https://itlab1286-eng.github.io/PGpage/app_version.json?t=<timestamp>` and compares `versionCode` against the installed app's `BuildConfig.VERSION_CODE`.
   * If `remoteVersionCode > currentVersionCode`, the app prompts the user to **Update Now** or skip for the current session (**Later**).
   * Tapping **Update Now** downloads the APK via Android's `DownloadManager`, launches the native package installer, and automatically deletes the temporary `elysium_pg_update.apk` file once the user returns to the app.

---

## 2. Repository & Project File Structure

No extra folders are required in your GitHub repository. Everything lives in the root of `PGpage`:

```text
PGpage/
├── index.html
├── rent.html
├── new_resident.html
├── daily_staying.html
├── ...
└── app_version.json      <-- Controls OTA update prompts for all installed APKs
```

---

## 3. One-Time Initial Setup (Base v1.2 Installation)

Before devices can receive OTA updates, they must have at least **`v1.2` (`versionCode = 3`)** installed:

1. **Verify Android Studio Files:**
   * `app/src/main/AndroidManifest.xml` contains `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`.
   * `app/src/main/res/xml/file_paths.xml` contains `<external-files-path name="apk_updates" path="Download/" />`.
   * `app/build.gradle.kts` has `versionCode = 3` and `versionName = "1.2"`.
   * `MainActivity.kt` contains the `checkForAppUpdate()` and `cleanupOldUpdateApks()` methods.
2. **Build Signed Release APK:**
   * In Android Studio: **Build > Generate Signed App Bundle / APK...** $\rightarrow$ **APK** $\rightarrow$ select your existing `.jks` Keystore $\rightarrow$ choose **release** $\rightarrow$ **Create**.
3. **Commit `app_version.json` to GitHub Pages:**
   * Ensure `app_version.json` is pushed to the root of `itlab1286-eng/PGpage` with `"versionCode": 3`.
4. **Install on Staff Devices:**
   * Share the signed `v1.2` APK one final time and install it on staff phones.
   * When the first future update runs, Android will ask once to enable **"Allow from this source"** for Elysium PG.

---

## 4. Step-by-Step Checklist for Releasing a New App Update

Whenever you make native Android changes in the future, follow these **4 steps in exact order**:

### Step 1: Increment Version Numbers in `app/build.gradle.kts`
Open `app/build.gradle.kts` and increase both `versionCode` and `versionName`:

```kotlin
defaultConfig {
    applicationId = "com.elysium.pg"
    minSdk = 29
    targetSdk = 37
    versionCode = 4          // MUST be strictly higher than previous build (e.g., 3 -> 4)
    versionName = "1.3"      // Displayed in the user's update popup title
}
```

> **CRITICAL RULE:** Always bump `versionCode` in `build.gradle.kts` **before** generating the APK. If `app_version.json` has a higher `versionCode` than the APK you upload, users will get stuck in an infinite update loop.

### Step 2: Generate the Signed Release APK
1. In Android Studio, click **Build > Generate Signed App Bundle / APK...**
2. Choose **APK** and click **Next**.
3. Select your **same Keystore (`.jks`)** file and enter your passwords (using a different keystore will cause Android to reject the update).
4. Select the **release** build variant and click **Create**.
5. Click **locate** when the build completes and verify the file is named **`app-release.apk`**.

### Step 3: Upload the APK to GitHub Releases
1. Go to `https://github.com/itlab1286-eng/PGpage` in your browser.
2. On the right sidebar, click **Releases** $\rightarrow$ **Draft a new release** (or **Create a new release**).
3. Click **Choose a tag**, type the new version tag (e.g., **`v1.3`**), and select **Create new tag: v1.3 on publish**.
4. Set the **Release title** to **`v1.3`**.
5. Drag and drop **`app-release.apk`** into the **Attach binaries** area at the bottom.
6. Wait for the upload to complete, then click **Publish release**.
7. Confirm the direct asset link matches:
   ```text
   https://github.com/itlab1286-eng/PGpage/releases/download/v1.3/app-release.apk
   ```

### Step 4: Update `app_version.json` and Push
1. Open `app_version.json` in your `PGpage` repository and update all four fields to match Step 1 and Step 3:

```json
{
  "versionCode": 4,
  "versionName": "1.3",
  "apkUrl": "https://github.com/itlab1286-eng/PGpage/releases/download/v1.3/app-release.apk",
  "releaseNotes": "Describe what changed in this update for your staff."
}
```

2. Commit and push `app_version.json` to GitHub.
3. Wait **1–2 minutes** for GitHub Pages to publish the updated JSON, then open the Elysium PG app to verify the update prompt appears.

---

## 5. User Experience & Behavior

* **Update Prompt:** Appears automatically when opening the app if `remoteVersionCode > BuildConfig.VERSION_CODE`.
* **"Later" Button:** Dismisses the dialog for the current session so staff aren't interrupted while working. The prompt will appear again the next time the app is closed and reopened.
* **"Update Now" Button:** Downloads the APK in the background (visible in the Android notification shade) and opens the native system installer.
* **Automatic Cleanup:** `cleanupOldUpdateApks()` deletes `elysium_pg_update.apk` from the app's private download cache on every `onCreate()` and `onResume()`, ensuring zero leftover installer files remain on the device.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| **"App not installed" error during update** | The new APK was signed with a different Keystore (or a Debug build was uploaded instead of a Signed Release APK). | Rebuild using the original `.jks` Release Keystore and re-upload to GitHub Releases. |
| **Update dialog keeps popping up after installing** | `versionCode` in `app/build.gradle.kts` was not incremented before building the APK. | Bump `versionCode` in `build.gradle.kts`, rebuild the signed APK, replace the release asset, and match `app_version.json`. |
| **Update dialog doesn't appear immediately after pushing JSON** | GitHub Pages CDN takes ~60–90 seconds to deploy a commit. | Wait 1–2 minutes, fully close the app from Recent Apps, and reopen it. |
| **Download starts but installer doesn't open** | "Install unknown apps" permission is disabled for Elysium PG on that phone. | Android will automatically open the permission toggle; enable **Allow from this source** and tap **Update Now** again. |