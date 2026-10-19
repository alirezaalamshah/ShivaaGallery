# Starts the backend (Django, port 8000) and the storefront (Next.js, port 3100)
# in two windows. Run from the project folder:  .\dev.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .venv\Scripts\python manage.py runserver 127.0.0.1:8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "Site:  http://localhost:3100"
Write-Host "Panel: http://localhost:3100/panel"
