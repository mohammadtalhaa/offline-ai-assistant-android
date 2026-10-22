# Offline Assistant (React Native + TypeScript, Android-first)

A private AI assistant that runs a quantized language model **on the phone**, with no server.
Chat works in airplane mode once a model is downloaded.

**Stack:** Expo SDK 54 (development build) · React Native 0.81 · TypeScript · `llama.rn` (llama.cpp, GGUF models) ·
SQLite · Zustand · React Navigation · Android Keystore (SecureStore).

## What's included

| Area | Status |
|---|---|
| Streaming chat, stop, regenerate, copy, share | ✅ |
| Conversation history: search, rename, archive, delete | ✅ |
| 5 presets: Assistant, Writer, Tutor, Summarizer, Translator (English / Urdu / Roman Urdu prompts) | ✅ |
| Model manager: catalog, free-space + RAM checks, resumable download, size check, delete, active model | ✅ |
| Offline document chat: import text files → chunk → BM25 retrieval → answers with numbered sources | ✅ (text files) |
| Local memory (`/remember ...`, view/edit/disable/erase) | ✅ |
| Context trimming, memory-aware load with fallback to smaller context | ✅ |
| Dark/light theme, accessibility labels | ✅ |
| Pro gating + offline entitlement grace period | ✅ logic · ⚠️ real Play Billing not wired |
| Demo engine fallback (so the UI runs in Expo Go) | ✅ |
| Voice (offline STT/TTS), PDF/OCR import, image understanding | ❌ not in v1 (see below) |

## Run it

Requires Node 20+, JDK 17, Android Studio (SDK + a physical phone with USB debugging, or an emulator with ≥6 GB RAM).

```bash
npm install
npx expo install --check        # optional: aligns versions with your Expo SDK
npx expo prebuild --platform android
npx expo run:android            # builds the dev client and installs it
```

Then open the **Models** tab, download *Qwen2.5 0.5B* (~0.5 GB, Wi-Fi), tap **Use this model**, switch on airplane mode and chat.

`npm run typecheck` and `npm test` verify the code. `expo start` in **Expo Go** works too, but llama.rn is a native module,
so Expo Go runs the **demo engine** (canned replies). Use `expo run:android` for real inference.

For a release build: `cd android && ./gradlew bundleRelease` (add your own signing config).

## Project layout

```
App.tsx, index.ts
src/
  config.ts                 ENFORCE_PRO flag, prices, free models, grace days
  features/inference/       InferenceEngine interface + LlamaEngine + MockEngine
  features/model-manager/   catalog.ts (manifest) + modelManager.ts (download/resume/delete)
  features/chat/            presets, prompt building, generation service
  features/retrieval/       chunker, BM25 ranking, document import
  features/billing/         entitlement logic + provider wiring point
  services/database/db.ts   SQLite schema and queries
  services/storage/         SecureStore wrapper
  store/useApp.ts           settings, models, engine lifecycle, entitlement
  screens/                  Home, Chat, Models, Documents, Memory, Upgrade, Settings
tests/                      Jest tests for chunker and retrieval
```

The UI only calls `InferenceEngine` (`src/features/inference/types.ts`). To benchmark LiteRT-LM or ExecuTorch, implement that
interface once and return it from `getEngine()`; no screen changes.

## Things you must do before shipping

1. **Verify models.** Check each URL, file size and **license** in `src/features/model-manager/catalog.ts`
   (commercial use, redistribution, attribution). Qwen2.5 0.5B/1.5B are Apache-2.0; Llama 3.2 has its own community license.
   Don't redistribute weights from your own server until you've confirmed the terms.
2. **Wire billing.** `ENFORCE_PRO` is `false`, so everything is unlocked. For real subscriptions, implement a
   `BillingProvider` in `src/features/billing/billing.ts` (e.g. `react-native-iap` + Google Play Billing), verify purchases
   with the Play Developer API (a hidden button is not security), then set `ENFORCE_PRO = true`. The dev provider is
   `__DEV__`-only and does no payment.
3. **Test on real devices** in three RAM classes (≈4 GB, 6 GB, 8 GB): time to first token, tokens/sec, peak memory,
   heat, battery. Inference is CPU-only (`n_gpu_layers: 0`) for compatibility; tune in `LlamaEngine.ts`.
4. **Inspect network traffic** to back up any "private/offline" claim. This app adds no analytics or crash reporting;
   the only network use is model downloads.
5. **Privacy policy** matching the above. Note: the SQLite database is *not* separately encrypted (it relies on the
   Android sandbox and device encryption). Add SQLCipher if you need at-rest encryption.

## Known limits (honest list)

- **Not run on a device in my build environment.** The project type-checks (`tsc` clean) and the retrieval tests pass, but native
  inference, downloads and billing need your phone to validate. Native build issues are the likeliest first-run hurdle:
  keep versions pinned, and if `llama.rn` fails to build, check its README for your Expo/RN version.
- Model download runs in the foreground (screen kept awake). Downloads can pause/resume, but Android may stop them if the app is killed;
  resume picks up from the saved partial file.
- **PDF import** isn't included (text extraction needs a native module). *Adding PDF support:* add a PDF-text library with
  an Android native implementation, call it in `importDocument()` in `src/features/retrieval/documents.ts`, and pass the text to `chunkText`.
  Scanned PDFs additionally need OCR.
- Retrieval is keyword-based (BM25), not semantic. Upgrade path: embeddings via llama.rn + vector search over the `chunks` table.
- Voice isn't built; add it after text chat is solid (separate STT model, TTS engine, permissions).
- Model sizes in the catalog are approximate.

## Slash commands

`/remember <fact>` saves a fact to local memory (Settings → Manage memory to view or erase).
