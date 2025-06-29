# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# Analysis for the main CLI application
a_cli = Analysis(
    ['pdf_to_cbz.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('config_manager.py', '.'),
        ('hints.py', '.'),
    ],
    hiddenimports=[
        'PIL._tkinter_finder',
        'PyPDF2',
        'pdf2image',
        'tqdm',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Analysis for the GUI application
a_gui = Analysis(
    ['pdf_to_cbz_gui.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('config_manager.py', '.'),
        ('hints.py', '.'),
    ],
    hiddenimports=[
        'PIL._tkinter_finder',
        'PyPDF2',
        'pdf2image',
        'tqdm',
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
        'tkinter.scrolledtext',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Merge the analyses
MERGE( (a_cli, 'pdf_to_cbz_cli', 'pdf_to_cbz_cli'), (a_gui, 'pdf_to_cbz_gui', 'pdf_to_cbz_gui') )

# PYZ for CLI
pyz_cli = PYZ(a_cli.pure, a_cli.zipped_data, cipher=block_cipher)

# PYZ for GUI
pyz_gui = PYZ(a_gui.pure, a_gui.zipped_data, cipher=block_cipher)

# Executable for CLI
exe_cli = EXE(
    pyz_cli,
    a_cli.scripts,
    a_cli.binaries,
    a_cli.zipfiles,
    a_cli.datas,
    [],
    name='pdf_to_cbz_cli',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='version_info.txt',
    icon='banner.png'
)

# Executable for GUI
exe_gui = EXE(
    pyz_gui,
    a_gui.scripts,
    a_gui.binaries,
    a_gui.zipfiles,
    a_gui.datas,
    [],
    name='pdf_to_cbz_gui',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='version_info.txt',
    icon='banner.png'
)

# Collect everything
coll = COLLECT(
    exe_cli,
    exe_gui,
    a_cli.binaries,
    a_cli.zipfiles,
    a_cli.datas,
    a_gui.binaries,
    a_gui.zipfiles,
    a_gui.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='pdf_to_cbz_v2.0.0'
)
