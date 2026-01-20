# 🐛 Debug Report - Analysis Failed Issue

## Problems Identified

### 1. ❌ Error Handling Bug in `pdf_analysis.rs` (CRITICAL)

**File:** `src-tauri/src/commands/pdf_analysis.rs`
**Lines:** 117-119

#### The Problem

```rust
// WRONG CODE (current)
let result = tokio::task::spawn_blocking(move || {
    // ... returns Ok::<PdfAnalysisResult, anyhow::Error>
})
.await
.map_err(|e| format!("Task join error: {}", e))?;  // ❌ BUG HERE

result.map_err(|e| format!("PDF analysis failed: {}", e))  // ❌ Can't use `result` after `?`
```

**Why it fails:**
1. `.await` returns `Result<Ok_Type, JoinError>`
2. `.map_err(...)?` converts JoinError to String and unwraps
3. The `?` operator exits early on error (correct)
4. But `result` is used after the `?` which already consumed it
5. The code should either:
   - Use `?` with chained `.map_err()`, OR
   - Store the value first

#### The Fix

**Option A: Chain the map_err** (Recommended)
```rust
let result = tokio::task::spawn_blocking(move || {
    // ... function body
})
.await
.map_err(|e| format!("Task join error: {}", e))?
.map_err(|e| format!("PDF analysis failed: {}", e))
```

**Option B: Store and handle separately**
```rust
let result = tokio::task::spawn_blocking(move || {
    // ... function body
})
.await
.map_err(|e| format!("Task join error: {}", e))?;

result.map_err(|e| format!("PDF analysis failed: {}", e))
```

---

### 2. ❌ Similar Bugs in Other Commands

These commands likely have the same error handling issue:

- ✅ `analyze_cbz()` - CHECK
- ✅ `generate_preview()` - CHECK
- ✅ `convert_pdf_to_cbz()` - CHECK
- ✅ `optimize_pdf()` - CHECK
- ✅ `generate_cbz_preview()` - CHECK

---

### 3. ⚠️ Missing Features

#### A. Drag & Drop Not Implemented

**File:** `src/pages/page.tsx`

Currently uses file dialog. Missing:
- `onDragOver` event handler
- `onDragLeave` event handler
- `onDrop` event handler
- Drop zone styling

**Solution:** Add handlers that call `selectPdfFile()` or `selectCbzFile()`

#### B. Language Selector Not Working

**File:** `src/components/LanguageSelector.tsx`

**Likely issues:**
1. Not using `useTranslation` hook correctly
2. `setLang()` doesn't persist selection
3. Component doesn't trigger re-render

**Check:**
- Does LanguageSelector import `useTranslation`?
- Does it call `setLang()`?
- Is the parent component using `useTranslation`?

---

## Step-by-Step Fixes

### Fix 1: Correct Error Handling in pdf_analysis.rs

**File:** `src-tauri/src/commands/pdf_analysis.rs`

**Change lines 117-119 from:**
```rust
.map_err(|e| format!("Task join error: {}", e))?;

result.map_err(|e| format!("PDF analysis failed: {}", e))
```

**To:**
```rust
.map_err(|e| format!("Task join error: {}", e))?
.map_err(|e| format!("PDF analysis failed: {}", e))
```

**Explanation:** Chain the `.map_err()` calls so the second one applies to the inner `anyhow::Error`.

---

### Fix 2: Check All Other Commands

Check each command file:
- `src-tauri/src/commands/cbz_analysis.rs`
- `src-tauri/src/commands/preview.rs`
- `src-tauri/src/commands/conversion.rs`

Look for same pattern:
```rust
.map_err(...)?;
result.map_err(...)
```

Replace with:
```rust
.map_err(...)?
.map_err(...)
```

---

### Fix 3: Add Drag & Drop Support

**File:** `src/pages/page.tsx`

**Add these handlers to the JSX container:**

```typescript
const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  // Add visual feedback (e.g., highlight border)
}, []);

const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  // Remove visual feedback
}, []);

const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  const path = file.path; // Tauri provides path property

  if (mode === 'pdf-to-cbz' && file.type === 'application/pdf') {
    await handlePdfFileSelect(path);
  } else if (mode === 'cbz-to-pdf' && (file.type === 'application/x-cbz' || file.name.endsWith('.cbz'))) {
    await handleCbzFileSelect(path);
  }
}, [mode, handlePdfFileSelect, handleCbzFileSelect]);
```

**Add to JSX:**
```tsx
<div
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-500"
>
  Drag and drop your file here
</div>
```

---

### Fix 4: Debug Language Selector

**Check `src/components/LanguageSelector.tsx`:**

Must have:
```typescript
import { useTranslation } from '@/lib/useTranslation';

export default function LanguageSelector() {
  const { lang, setLang } = useTranslation();

  return (
    <select value={lang} onChange={(e) => setLang(e.target.value as any)}>
      <option value="en">English</option>
      <option value="fr">Français</option>
      <option value="es">Español</option>
      <option value="zh">中文</option>
    </select>
  );
}
```

Check `src/lib/useTranslation.ts`:

Must have:
```typescript
export function useTranslation() {
  const [lang, setLang] = useState<Language>(() => {
    // Load from localStorage or default to 'en'
    return (localStorage.getItem('language') || 'en') as Language;
  });

  useEffect(() => {
    localStorage.setItem('language', lang);
  }, [lang]);

  return { lang, setLang, t: (key: string) => t(lang, key) };
}
```

---

## Testing with Sample Files

Once fixed, test with files from `sample_dir/`:

```bash
# Small test file (22 KB)
/Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/sample_dir/pdf2cbz_test_sample_1.pdf

# Medium test file (527 KB)
/Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/sample_dir/pdf2cbz_test_sample_0.pdf

# Large test file (8.9 MB)
/Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/sample_dir/Vers_les_Etoiles_BD.pdf

# Test CBZ file (993 KB)
/Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/sample_dir/Vers_les_Etoiles_BD.cbz
```

---

## Build & Test Commands

```bash
# In pdf-to-cbz-tauri directory

# 1. Fix the Rust code first

# 2. Build UI only
npm run build:ui

# 3. Build Rust backend (will compile Rust code)
cd src-tauri
cargo build

# 4. Run in development mode
npm run tauri dev

# 5. If still getting errors, check the Tauri dev console
# Look for error messages from the Rust backend
```

---

## Expected Errors During Compilation

If you see these Rust errors, fix them:

### Error 1: "unused variable `result`"
**Cause:** The code tries to use `result` after the `?` operator consumed it
**Fix:** Chain `.map_err()` instead

### Error 2: "could not compile `pdf-to-cbz-converter`"
**Cause:** Missing or wrong Rust syntax
**Fix:** Run `cargo check` in `src-tauri/` to get detailed error messages

### Error 3: "invoke called with invalid command"
**Cause:** Command name doesn't match between Rust and TypeScript
**Fix:** Verify command names match exactly:
- Rust: `#[tauri::command] pub async fn analyze_pdf`
- TypeScript: `invoke('analyze_pdf', { path })`

---

## Summary of Changes Needed

| Issue | File | Type | Difficulty | Time |
|-------|------|------|------------|------|
| Error handling bug | pdf_analysis.rs | Rust | 🟢 Easy | 5 min |
| Similar bugs | Other commands | Rust | 🟢 Easy | 15 min |
| Drag & drop | page.tsx | TypeScript | 🟡 Medium | 20 min |
| Language selector | LanguageSelector.tsx | TypeScript | 🟡 Medium | 10 min |
| **TOTAL** | - | - | **🟡 Medium** | **~50 min** |

---

## Next Steps

1. ✅ Read this report completely
2. ⚠️ Fix Rust error handling in `pdf_analysis.rs`
3. ⚠️ Check all other Rust command files
4. ⚠️ Build Rust backend: `cd src-tauri && cargo build`
5. ⚠️ Test with `npm run tauri dev`
6. ⚠️ Add drag & drop if still missing
7. ⚠️ Verify language selector works
8. ✅ Test with all sample files
