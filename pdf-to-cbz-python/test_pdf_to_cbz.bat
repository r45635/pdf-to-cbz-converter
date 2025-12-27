@echo off
SET SCRIPT=pdf_to_cbz.py
SET INPUT_PDF=sample_dir\\pdf2cbz_test_sample_0.pdf
SET INPUT_DIR=sample_dir
SET OUTPUT_DIR=out_cbz

echo ===============================
echo TEST 1: --help
python %SCRIPT% --help
echo.

echo ===============================
echo TEST 2: --version
python %SCRIPT% --version
echo.

echo ===============================
echo TEST 3: Basic conversion
python %SCRIPT% %INPUT_PDF% --force
echo.

echo ===============================
echo TEST 4: JPEG conversion with quality 75
python %SCRIPT% %INPUT_PDF% --format=jpeg --quality=75 --force --output-dir=%OUTPUT_DIR%
echo.

echo ===============================
echo TEST 5: Auto DPI
python %SCRIPT% %INPUT_PDF% --auto-dpi --force --output-dir=%OUTPUT_DIR%
echo.

echo ===============================
echo TEST 6: Analyse mode
python %SCRIPT% %INPUT_PDF% --analyse
echo.

echo ===============================
echo TEST 7: Dry run
python %SCRIPT% %INPUT_PDF% --dry-run --verbose
echo.

echo ===============================
echo TEST 8: Custom prefix and keep temp
python %SCRIPT% %INPUT_PDF% --prefix=pg_ --keep-temp --output-dir=%OUTPUT_DIR% --force
echo.

echo ===============================
echo TEST 9: Threads = 4
python %SCRIPT% %INPUT_PDF% --threads=4 --format=jpeg --force --output-dir=%OUTPUT_DIR%
echo.

echo ===============================
echo TEST 10: Convert full directory
python %SCRIPT% %INPUT_DIR% --format=jpeg --force --output-dir=%OUTPUT_DIR%
echo.

echo ===============================
echo TEST 11: CBZ with comment
python %SCRIPT% %INPUT_PDF% --cbz-comment="Test archive comment" --output-dir=%OUTPUT_DIR% --force
echo.

echo ===============================
echo TEST 12: Logging to file
python %SCRIPT% %INPUT_PDF% --logfile=conversion.log --force
echo.

echo ===============================
echo ✅ ALL TESTS COMPLETED
pause
