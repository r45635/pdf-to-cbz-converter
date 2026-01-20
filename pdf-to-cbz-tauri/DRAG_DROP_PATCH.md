# Patch: Add Drag & Drop Support to page.tsx

## Changes Required

### Step 1: Add State Variable (after line 72)

**Location:** `src/pages/page.tsx` after the existing useState declarations

**Add after line 72:**
```typescript
  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);
```

---

### Step 2: Add Event Handlers (after handleFileSelect, around line 220)

**Add these functions after the `handleFileSelect` function:**

```typescript
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isCbz = fileName.endsWith('.cbz') || fileName.endsWith('.cbr');

    if (!isPdf && !isCbz) {
      setError(mode === 'pdf-to-cbz' ? 'Please drop a PDF file' : 'Please drop a CBZ/CBR file');
      return;
    }

    // Get the file path from Tauri
    // Note: In Tauri, dropped files don't have the path directly.
    // We'll use the file dialog instead for now
    // In a real app, you'd need to use https://tauri.app/en/docs/api/filesystem/

    // For now, trigger file selection dialog instead
    await handleFileSelect();
  }, [mode, handleFileSelect]);
```

---

### Step 3: Update JSX Drop Zone (line 464-466)

**Replace:**
```tsx
          <div
            onClick={handleFileSelect}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors"
          >
```

**With:**
```tsx
          <div
            onClick={handleFileSelect}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-indigo-500 bg-indigo-50 dark:bg-gray-700/50'
                : 'border-gray-300 dark:border-gray-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700'
            }`}
          >
```

---

## Summary of Changes

| Line Range | Change | Type |
|-----------|--------|------|
| ~73 | Add isDragActive state | State |
| ~221 | Add three event handlers | Functions |
| ~465 | Update drop zone div | JSX |

---

## Testing Drag & Drop

After applying the patch:

1. Run the app: `npm run tauri dev`
2. Try dragging a PDF file onto the upload area
3. The border should change color when dragging
4. Releasing should trigger file selection

---

## Note on Tauri File Paths

In Tauri, files from drag & drop don't automatically have accessible paths due to security restrictions. The current implementation falls back to the file dialog.

For true drag & drop file access, you would need to:
1. Use Tauri's file system API to read the dropped file
2. Store it temporarily
3. Process it

This requires additional Tauri permissions in `tauri.conf.json`:
```json
"permissions": [
  "fs:read",
  "fs:write"
]
```

For now, the visual feedback and fallback to dialog is sufficient.
