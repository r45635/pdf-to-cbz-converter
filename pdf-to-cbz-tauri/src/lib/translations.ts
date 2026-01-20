export type Language = 'en' | 'fr' | 'es' | 'zh';

export const languages: { code: Language; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export const translations = {
  en: {
    // Header
    title: 'PDF ↔ CBZ Converter',
    pdfToCbz: 'PDF → CBZ',
    cbzToPdf: 'CBZ → PDF',
    batchMode: 'Batch Mode',

    // File upload
    dropPdf: 'Drop PDF here or click to browse',
    dropCbz: 'Drop CBZ here or click to browse',
    analyzing: 'Analyzing...',

    // Analysis
    pages: 'Pages',
    images: 'Images',
    size: 'Size',
    native: 'Native',
    hd: 'HD',
    dimensions: 'Dim',

    // Options
    matchPdf: 'Match PDF',
    quality: 'Quality',
    scale: 'Scale',
    format: 'Format',

    // Auto-optimize
    autoOptimize: 'Auto-find optimal DPI/quality',
    findOptimal: 'Find Optimal',
    showResults: 'Show',
    hideResults: 'Hide',
    results: 'results',

    // Buttons
    convert: 'Convert',
    direct: 'Direct',
    converting: 'Converting...',
    extracting: 'Extracting...',

    // Preview
    livePreview: 'Live Preview',
    comparison: 'Comparison',
    compare: 'Compare',
    back: 'Back',
    page: 'Page',
    of: 'of',
    original: 'Original',
    reset: 'Reset',

    // Messages
    uploadPdf: 'Upload a PDF to see preview',
    uploadCbz: 'Upload a CBZ file to convert',
    cbzReady: 'CBZ ready for conversion',
    updating: 'updating...',
    loadingPreview: 'Loading preview...',

    // Footer
    footer: 'Open source project',
    madeWith: 'Made with',
    viewOnGithub: 'View on GitHub',

    // Batch page
    batchConversion: 'Batch Conversion',
    batchDescPdf: 'Convert multiple PDFs to CBZ simultaneously',
    batchDescCbz: 'Convert multiple CBZs to PDF simultaneously',
    singleFileMode: 'Single file mode',
    startConversion: 'Start conversion',
    files: 'files',
    file: 'file',
    conversionInProgress: 'Conversion in progress...',
    cancel: 'Cancel',
    globalProgress: 'Global progress',
    errors: 'errors',
    maxFilesAllowed: 'Maximum {n} files allowed',
    fileTooLarge: '"{name}" exceeds the {n} MB limit',
    serverConnectionError: 'Server connection error',
    noResponseStream: 'No response stream',
    conversionError: 'Conversion error',

    // BatchSettings
    conversionSettings: 'Conversion settings',
    resolution: 'Resolution (DPI)',
    autoNative: 'Auto (native)',
    imageFormat: 'Image format',
    jpegQuality: 'JPEG quality',
    resultsExpiration: 'Results expiration',
    minutes: 'minutes',
    hour: 'hour',
    hours: 'hours',
    advancedSettings: 'Advanced settings',
    maxFilesLabel: 'Max files (server max: {n})',
    maxFileSizeLabel: 'Max file size in MB (server max: {n})',
    advancedInfo: 'These limits apply to this session. The server has maximum limits you cannot exceed.',

    // BatchUploader
    dropFilesHere: 'Drop your {type}s here or click to browse',
    addMoreFiles: 'Add more files ({n}/{max})',
    limitReached: 'Limit reached ({n}/{max} files)',
    maxInfo: 'Max {n} files, {size} MB/file',
    deleteAll: 'Delete all',
    pending: 'Pending',
    pageProgress: 'Page {current}/{total}',
    completed: 'Completed',
    error: 'Error',

    // BatchResults
    conversionComplete: 'Conversion complete',
    succeeded: 'succeeded',
    expiresIn: 'Expires in',
    expired: 'Expired',
    download: 'Download',
    copyLink: 'Copy link',
    downloadAllZip: 'Download all (ZIP)',
    copyAllLinks: 'Copy all links',
    copied: 'Copied!',
  },

  fr: {
    // Header
    title: 'Convertisseur PDF ↔ CBZ',
    pdfToCbz: 'PDF → CBZ',
    cbzToPdf: 'CBZ → PDF',
    batchMode: 'Mode Batch',

    // File upload
    dropPdf: 'Déposez un PDF ici ou cliquez pour parcourir',
    dropCbz: 'Déposez un CBZ ici ou cliquez pour parcourir',
    analyzing: 'Analyse en cours...',

    // Analysis
    pages: 'Pages',
    images: 'Images',
    size: 'Taille',
    native: 'Natif',
    hd: 'HD',
    dimensions: 'Dim',

    // Options
    matchPdf: 'Identique PDF',
    quality: 'Qualité',
    scale: 'Échelle',
    format: 'Format',

    // Auto-optimize
    autoOptimize: 'Trouver automatiquement DPI/qualité optimaux',
    findOptimal: 'Optimiser',
    showResults: 'Afficher',
    hideResults: 'Masquer',
    results: 'résultats',

    // Buttons
    convert: 'Convertir',
    direct: 'Direct',
    converting: 'Conversion...',
    extracting: 'Extraction...',

    // Preview
    livePreview: 'Aperçu en direct',
    comparison: 'Comparaison',
    compare: 'Comparer',
    back: 'Retour',
    page: 'Page',
    of: 'sur',
    original: 'Original',
    reset: 'Reset',

    // Messages
    uploadPdf: 'Chargez un PDF pour voir l\'aperçu',
    uploadCbz: 'Chargez un fichier CBZ à convertir',
    cbzReady: 'CBZ prêt pour la conversion',
    updating: 'mise à jour...',
    loadingPreview: 'Chargement de l\'aperçu...',

    // Footer
    footer: 'Projet open source',
    madeWith: 'Fait avec',
    viewOnGithub: 'Voir sur GitHub',

    // Batch page
    batchConversion: 'Conversion Batch',
    batchDescPdf: 'Convertissez plusieurs PDFs en CBZ simultanément',
    batchDescCbz: 'Convertissez plusieurs CBZs en PDF simultanément',
    singleFileMode: 'Mode fichier unique',
    startConversion: 'Démarrer la conversion',
    files: 'fichiers',
    file: 'fichier',
    conversionInProgress: 'Conversion en cours...',
    cancel: 'Annuler',
    globalProgress: 'Progression globale',
    errors: 'erreurs',
    maxFilesAllowed: 'Maximum {n} fichiers autorisés',
    fileTooLarge: '"{name}" dépasse la limite de {n} MB',
    serverConnectionError: 'Erreur de connexion au serveur',
    noResponseStream: 'Pas de flux de réponse',
    conversionError: 'Erreur de conversion',

    // BatchSettings
    conversionSettings: 'Paramètres de conversion',
    resolution: 'Résolution (DPI)',
    autoNative: 'Auto (natif)',
    imageFormat: 'Format d\'image',
    jpegQuality: 'Qualité JPEG',
    resultsExpiration: 'Expiration des résultats',
    minutes: 'minutes',
    hour: 'heure',
    hours: 'heures',
    advancedSettings: 'Paramètres avancés',
    maxFilesLabel: 'Fichiers max (max serveur: {n})',
    maxFileSizeLabel: 'Taille max en MB (max serveur: {n})',
    advancedInfo: 'Ces limites s\'appliquent à cette session. Le serveur a des limites maximales que vous ne pouvez pas dépasser.',

    // BatchUploader
    dropFilesHere: 'Glissez vos {type}s ici ou cliquez pour parcourir',
    addMoreFiles: 'Ajouter des fichiers ({n}/{max})',
    limitReached: 'Limite atteinte ({n}/{max} fichiers)',
    maxInfo: 'Max {n} fichiers, {size} MB/fichier',
    deleteAll: 'Tout supprimer',
    pending: 'En attente',
    pageProgress: 'Page {current}/{total}',
    completed: 'Terminé',
    error: 'Erreur',

    // BatchResults
    conversionComplete: 'Conversion terminée',
    succeeded: 'réussis',
    expiresIn: 'Expire dans',
    expired: 'Expiré',
    download: 'Télécharger',
    copyLink: 'Copier le lien',
    downloadAllZip: 'Tout télécharger (ZIP)',
    copyAllLinks: 'Copier tous les liens',
    copied: 'Copié !',
  },

  es: {
    // Header
    title: 'Convertidor PDF ↔ CBZ',
    pdfToCbz: 'PDF → CBZ',
    cbzToPdf: 'CBZ → PDF',
    batchMode: 'Modo Lote',

    // File upload
    dropPdf: 'Suelta el PDF aquí o haz clic para explorar',
    dropCbz: 'Suelta el CBZ aquí o haz clic para explorar',
    analyzing: 'Analizando...',

    // Analysis
    pages: 'Páginas',
    images: 'Imágenes',
    size: 'Tamaño',
    native: 'Nativo',
    hd: 'HD',
    dimensions: 'Dim',

    // Options
    matchPdf: 'Igual al PDF',
    quality: 'Calidad',
    scale: 'Escala',
    format: 'Formato',

    // Auto-optimize
    autoOptimize: 'Encontrar DPI/calidad óptimos automáticamente',
    findOptimal: 'Optimizar',
    showResults: 'Mostrar',
    hideResults: 'Ocultar',
    results: 'resultados',

    // Buttons
    convert: 'Convertir',
    direct: 'Directo',
    converting: 'Convirtiendo...',
    extracting: 'Extrayendo...',

    // Preview
    livePreview: 'Vista previa en vivo',
    comparison: 'Comparación',
    compare: 'Comparar',
    back: 'Volver',
    page: 'Página',
    of: 'de',
    original: 'Original',
    reset: 'Reset',

    // Messages
    uploadPdf: 'Sube un PDF para ver la vista previa',
    uploadCbz: 'Sube un archivo CBZ para convertir',
    cbzReady: 'CBZ listo para conversión',
    updating: 'actualizando...',
    loadingPreview: 'Cargando vista previa...',

    // Footer
    footer: 'Proyecto de código abierto',
    madeWith: 'Hecho con',
    viewOnGithub: 'Ver en GitHub',

    // Batch page
    batchConversion: 'Conversión por lotes',
    batchDescPdf: 'Convierte varios PDFs a CBZ simultáneamente',
    batchDescCbz: 'Convierte varios CBZs a PDF simultáneamente',
    singleFileMode: 'Modo archivo único',
    startConversion: 'Iniciar conversión',
    files: 'archivos',
    file: 'archivo',
    conversionInProgress: 'Conversión en curso...',
    cancel: 'Cancelar',
    globalProgress: 'Progreso global',
    errors: 'errores',
    maxFilesAllowed: 'Máximo {n} archivos permitidos',
    fileTooLarge: '"{name}" supera el límite de {n} MB',
    serverConnectionError: 'Error de conexión al servidor',
    noResponseStream: 'Sin flujo de respuesta',
    conversionError: 'Error de conversión',

    // BatchSettings
    conversionSettings: 'Configuración de conversión',
    resolution: 'Resolución (DPI)',
    autoNative: 'Auto (nativo)',
    imageFormat: 'Formato de imagen',
    jpegQuality: 'Calidad JPEG',
    resultsExpiration: 'Expiración de resultados',
    minutes: 'minutos',
    hour: 'hora',
    hours: 'horas',
    advancedSettings: 'Configuración avanzada',
    maxFilesLabel: 'Archivos máx (máx servidor: {n})',
    maxFileSizeLabel: 'Tamaño máx en MB (máx servidor: {n})',
    advancedInfo: 'Estos límites aplican a esta sesión. El servidor tiene límites máximos que no puedes exceder.',

    // BatchUploader
    dropFilesHere: 'Suelta tus {type}s aquí o haz clic para explorar',
    addMoreFiles: 'Añadir más archivos ({n}/{max})',
    limitReached: 'Límite alcanzado ({n}/{max} archivos)',
    maxInfo: 'Máx {n} archivos, {size} MB/archivo',
    deleteAll: 'Eliminar todo',
    pending: 'Pendiente',
    pageProgress: 'Página {current}/{total}',
    completed: 'Completado',
    error: 'Error',

    // BatchResults
    conversionComplete: 'Conversión completa',
    succeeded: 'exitosos',
    expiresIn: 'Expira en',
    expired: 'Expirado',
    download: 'Descargar',
    copyLink: 'Copiar enlace',
    downloadAllZip: 'Descargar todo (ZIP)',
    copyAllLinks: 'Copiar todos los enlaces',
    copied: '¡Copiado!',
  },

  zh: {
    // Header
    title: 'PDF ↔ CBZ 转换器',
    pdfToCbz: 'PDF → CBZ',
    cbzToPdf: 'CBZ → PDF',
    batchMode: '批量模式',

    // File upload
    dropPdf: '拖放PDF文件到此处或点击浏览',
    dropCbz: '拖放CBZ文件到此处或点击浏览',
    analyzing: '分析中...',

    // Analysis
    pages: '页数',
    images: '图片',
    size: '大小',
    native: '原始',
    hd: '高清',
    dimensions: '尺寸',

    // Options
    matchPdf: '匹配PDF',
    quality: '质量',
    scale: '缩放',
    format: '格式',

    // Auto-optimize
    autoOptimize: '自动查找最佳DPI/质量',
    findOptimal: '优化',
    showResults: '显示',
    hideResults: '隐藏',
    results: '个结果',

    // Buttons
    convert: '转换',
    direct: '直接',
    converting: '转换中...',
    extracting: '提取中...',

    // Preview
    livePreview: '实时预览',
    comparison: '对比',
    compare: '对比',
    back: '返回',
    page: '页',
    of: '/',
    original: '原图',
    reset: '重置',

    // Messages
    uploadPdf: '上传PDF文件以预览',
    uploadCbz: '上传CBZ文件以转换',
    cbzReady: 'CBZ已准备好转换',
    updating: '更新中...',
    loadingPreview: '加载预览中...',

    // Footer
    footer: '开源项目',
    madeWith: '使用',
    viewOnGithub: '在GitHub上查看',

    // Batch page
    batchConversion: '批量转换',
    batchDescPdf: '同时转换多个PDF为CBZ',
    batchDescCbz: '同时转换多个CBZ为PDF',
    singleFileMode: '单文件模式',
    startConversion: '开始转换',
    files: '个文件',
    file: '个文件',
    conversionInProgress: '转换中...',
    cancel: '取消',
    globalProgress: '总体进度',
    errors: '个错误',
    maxFilesAllowed: '最多允许{n}个文件',
    fileTooLarge: '"{name}"超过{n}MB限制',
    serverConnectionError: '服务器连接错误',
    noResponseStream: '无响应流',
    conversionError: '转换错误',

    // BatchSettings
    conversionSettings: '转换设置',
    resolution: '分辨率 (DPI)',
    autoNative: '自动 (原始)',
    imageFormat: '图片格式',
    jpegQuality: 'JPEG质量',
    resultsExpiration: '结果过期时间',
    minutes: '分钟',
    hour: '小时',
    hours: '小时',
    advancedSettings: '高级设置',
    maxFilesLabel: '最大文件数 (服务器限制: {n})',
    maxFileSizeLabel: '最大文件大小 MB (服务器限制: {n})',
    advancedInfo: '这些限制适用于本次会话。服务器有最大限制，您无法超过。',

    // BatchUploader
    dropFilesHere: '将{type}文件拖放到此处或点击浏览',
    addMoreFiles: '添加更多文件 ({n}/{max})',
    limitReached: '已达上限 ({n}/{max} 个文件)',
    maxInfo: '最多 {n} 个文件，每个 {size} MB',
    deleteAll: '全部删除',
    pending: '等待中',
    pageProgress: '第 {current}/{total} 页',
    completed: '已完成',
    error: '错误',

    // BatchResults
    conversionComplete: '转换完成',
    succeeded: '成功',
    expiresIn: '过期时间',
    expired: '已过期',
    download: '下载',
    copyLink: '复制链接',
    downloadAllZip: '全部下载 (ZIP)',
    copyAllLinks: '复制所有链接',
    copied: '已复制！',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
