@echo off
echo ========================================
echo Force Fix User Status
echo ========================================
echo.
cd /d D:\ProjectPackage\RagInt\Auth

echo Step 1: Checking current user status...
python -c "import sqlite3; conn = sqlite3.connect('new_backend/data/auth.db'); cursor = conn.cursor(); cursor.execute('SELECT username, status FROM users'); print('Current users:'); [print(f'  {row[0]}: status={row[1]}') for row in cursor.fetchall()]; conn.close()"

echo.
echo Step 2: Forcing ALL users to 'active' status...
python -c "import sqlite3; conn = sqlite3.connect('new_backend/data/auth.db'); cursor = conn.cursor(); cursor.execute('UPDATE users SET status = \"active\"'); conn.commit(); print('Updated rows:', cursor.rowcount); conn.close()"

echo.
echo Step 3: Verifying fix...
python -c "import sqlite3; conn = sqlite3.connect('new_backend/data/auth.db'); cursor = conn.cursor(); cursor.execute('SELECT username, status FROM users'); print('Users after fix:'); [print(f'  {row[0]}: status={row[1]}') for row in cursor.fetchall()]; conn.close()"

echo.
echo ========================================
echo FIX COMPLETE!
echo ========================================
echo.
echo Please:
echo 1. Restart the backend server (press Ctrl+C and run it again)
echo 2. Clear your browser cookies
echo 3. Try logging in again
echo.
pause
