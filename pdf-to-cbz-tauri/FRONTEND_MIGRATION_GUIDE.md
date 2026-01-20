# Frontend Migration Quick Reference

## Required Changes for page.tsx

### 1. Import Changes

**Remove:**
```typescript
'use client';
import Link from 'next/link';
```

**Add:**
```typescript
import * as TauriClient from '@/lib/tauri-client';
```

### 2. Add Navigation Prop

```typescript
interface HomeProps {
  onNavigateToBatch?: () => void;
}

export default function Home({ onNavigateToBatch }: HomeProps) {
```

### 3. Replace State

**Remove:**
```typescript
const [file, setFile] = useState<File | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
```

**Add:**
```typescript
const [filePath, setFilePath] = useState<string | null>(null);
```

### 4. File Selection Handler

**Replace:**
```typescript
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  // ... existing code
}
```

**With:**
```typescript
const handleFileSelect = async () => {
  setError(null);
  
  const path = mode === 'pdf-to-cbz' 
    ? await TauriClient.selectPdfFile()
    : await TauriClient.selectCbzFile();
    
  if (!path) return;
  
  setFilePath(path);
  setFile(null); // Keep for compatibility with existing preview logic
  
  // Analyze the file
  setIsAnalyzing(true);
  try {
    if (mode === 'pdf-to-cbz') {
      const result = await TauriClient.analyzePdf(path);
      setAnalysis(result);
      setDpi(result.nativeDpi.toString());
    } else {
      const result = await TauriClient.analyzeCbz(path);
      setAnalysis(result);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Analysis failed');
  } finally {
    setIsAnalyzing(false);
  }
};
```

### 5. Update Preview Generation

**Replace the preview fetch logic around line 223:**
```typescript
const response = await fetch('/api/preview', {
  method: 'POST',
  body: formData,
});
const blob = await response.blob();
```

**With:**
```typescript
if (!filePath) return;

const imageData = await TauriClient.generatePreview(
  filePath,
  page,
  parseInt(dpi) || 150,
  format,
  quality
);

const blob = new Blob([imageData], { type: `image/${format}` });
```

### 6. Update Conversion Logic

**Replace around line 400:**
```typescript
const response = await fetch(endpoint, {
  method: 'POST',
  body: formData,
});

if (!response.ok) {
  // error handling
}

const blob = await response.blob();
```

**With:**
```typescript
if (!filePath) return;

const imageData = await TauriClient.convertPdfToCbz(
  filePath,
  parseInt(dpi) || 150,
  format,
  quality,
  (progress) => {
    setConversionProgress(progress.percentage);
    setConversionStatus(progress.message || '');
  }
);

const blob = new Blob([imageData], { type: 'application/zip' });
```

### 7. Update Optimize Logic

**Replace around line 459:**
```typescript
const response = await fetch('/api/optimize-stream', {
  method: 'POST',
  body: formData,
});

const reader = response.body?.getReader();
// ... stream processing
```

**With:**
```typescript
if (!filePath) return;

const imageData = await TauriClient.optimizePdf(
  filePath,
  (progress) => {
    setConversionProgress(progress.percentage);
    setConversionStatus(progress.message || '');
  }
);

const blob = new Blob([imageData], { type: 'application/zip' });
```

### 8. Update Download Logic

**Replace:**
```typescript
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

**With:**
```typescript
const savePath = await TauriClient.saveCbzFile(filename);
if (savePath) {
  await TauriClient.saveDataToFile(new Uint8Array(await blob.arrayBuffer()), savePath);
  // Show success message
}
```

### 9. Update the Link to Batch Mode

**Replace:**
```typescript
<Link href="/batch">
  <button>{t('batchMode')}</button>
</Link>
```

**With:**
```typescript
<button onClick={onNavigateToBatch}>
  {t('batchMode')}
</button>
```

### 10. Remove File Input Element

**Remove this entire section:**
```typescript
<input
  ref={fileInputRef}
  type="file"
  accept={mode === 'pdf-to-cbz' ? '.pdf' : '.cbz,.cbr'}
  onChange={handleFileChange}
  style={{ display: 'none' }}
/>
```

## Required Changes for batch.tsx

### 1. Import and Prop Changes

**Remove:**
```typescript
'use client';
import Link from 'next/link';
```

**Add:**
```typescript
import * as TauriClient from '@/lib/tauri-client';

interface BatchProps {
  onNavigateToHome?: () => void;
}

export default function Batch({ onNavigateToHome }: BatchProps) {
```

### 2. File Selection

**Replace file input logic with:**
```typescript
const handleSelectFiles = async () => {
  const paths = mode === 'pdf-to-cbz'
    ? await TauriClient.selectMultiplePdfFiles()
    : []; // Implement selectMultipleCbzFiles if needed
    
  if (paths.length === 0) return;
  
  // Convert paths to file objects for existing logic
  const fileObjects = paths.map((path, index) => ({
    id: `file-${index}`,
    path,
    name: path.split('/').pop() || `file-${index}`,
    status: 'pending' as const,
  }));
  
  setFiles(fileObjects);
};
```

### 3. Batch Conversion

**Replace the batch conversion fetch logic with a loop:**
```typescript
const handleConvert = async () => {
  setIsConverting(true);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      updateFileStatus(file.id, 'processing');
      
      const imageData = await TauriClient.convertPdfToCbz(
        file.path,
        settings.dpi,
        settings.format,
        settings.quality,
        (progress) => {
          // Update progress for this file
          setGlobalProgress({
            completedFiles: i,
            totalFiles: files.length,
            currentFileProgress: progress.percentage,
          });
        }
      );
      
      // Save the file
      const outputPath = file.path.replace('.pdf', '.cbz');
      await TauriClient.saveDataToFile(imageData, outputPath);
      
      updateFileStatus(file.id, 'completed');
    } catch (err) {
      updateFileStatus(file.id, 'error', err.message);
    }
  }
  
  setIsConverting(false);
};
```

### 4. Update Link Back

**Replace:**
```typescript
<Link href="/">
  <button>{t('singleFileMode')}</button>
</Link>
```

**With:**
```typescript
<button onClick={onNavigateToHome}>
  {t('singleFileMode')}
</button>
```

## Testing Checklist

After making these changes, test:

1. ✅ File selection dialog opens
2. ✅ PDF analysis works
3. ✅ Preview generation works
4. ✅ DPI slider updates preview
5. ✅ Format toggle updates preview
6. ✅ Quality slider updates preview
7. ✅ Conversion works with progress
8. ✅ File save dialog works
9. ✅ Navigation between pages works
10. ✅ Batch mode works with multiple files

## Note on File Object Compatibility

The original code uses `File` objects from the browser. Since Tauri uses file paths (strings), you have two options:

1. **Keep File objects**: Create mock File objects from paths for compatibility
2. **Refactor**: Change all File usage to string paths

Option 1 is easier for migration. Option 2 is cleaner long-term.

For now, use Option 1 by storing both `filePath` (string) and keeping the `file` state for preview compatibility.
