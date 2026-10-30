param(
  [int]$Corridas = 5,
  [int]$MaxLintErrores = 323,
  [int]$MaxLintAvisos = 84,
  [int]$MinUnit = 658,
  [int]$MinE2E = 254,
  [string]$Base = "main",
  [string]$Salida = "$env:TEMP\cierre"
)

$ErrorActionPreference = "Continue"

# Asegurar suficiente espacio de heap para Jest en Node 24 con VM Modules (evita 0xC0000409)
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:UV_THREADPOOL_SIZE = "16"

if (-not (Test-Path $Salida)) {
  New-Item -ItemType Directory -Force -Path $Salida | Out-Null
}

$lineasResumen = @()
$todasPass = $true

Write-Host "====================================================="
Write-Host "INICIANDO VERIFICACION MECANICA DE CIERRE DE HITO"
Write-Host "Base: $Base | Corridas E2E: $Corridas | Salida: $Salida"
Write-Host "====================================================="

# -----------------------------------------------------------------------------
# 1. GIT INFO (HEAD, log, diff --stat)
# -----------------------------------------------------------------------------
Write-Host "[1/11] Registrando información de Git..."
$headCommit = (git rev-parse HEAD).Trim()
$gitLog = git log --format="%H %s" "$Base..HEAD"
$gitDiffStat = git diff --stat "$Base..HEAD"

$headFile = Join-Path $Salida "01_git_info.txt"
@(
  "HEAD: $headCommit",
  "`n--- LOG ($Base..HEAD) ---",
  $gitLog,
  "`n--- DIFF STAT ($Base..HEAD) ---",
  $gitDiffStat
) | Out-File -FilePath $headFile -Encoding utf8

# -----------------------------------------------------------------------------
# 2. BUILD
# -----------------------------------------------------------------------------
Write-Host "[2/11] Ejecutando BUILD (npm run build)..."
$buildLog = Join-Path $Salida "02_build.log"
cmd.exe /c "npm run build > `"$buildLog`" 2>&1"
$buildExit = $LASTEXITCODE
if ($buildExit -eq 0) {
  $lineasResumen += "[PASS] BUILD | npm run build | exit 0 | compilacion limpia | $buildLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] BUILD | npm run build | exit $buildExit | error de compilacion | $buildLog"
}

# -----------------------------------------------------------------------------
# 3. LINT_RAMA
# -----------------------------------------------------------------------------
Write-Host "[3/11] Ejecutando LINT_RAMA sobre archivos .ts tocados..."
$archivosDiff = git diff --name-only --diff-filter=AM "$Base..HEAD"
$archivosTs = $archivosDiff | Where-Object { $_ -match '\.ts$' }

$lintRamaLog = Join-Path $Salida "03_lint_rama.log"
if (-not $archivosTs -or $archivosTs.Count -eq 0) {
  "No hay archivos .ts modificados respecto a $Base" | Out-File -FilePath $lintRamaLog -Encoding utf8
  $lineasResumen += "[PASS] LINT_RAMA | npx eslint (archivos rama) | exit 0 | 0 archivos .ts tocados | $lintRamaLog"
} else {
  $archivosTsLista = ($archivosTs | ForEach-Object { "`"$_`"" }) -join " "
  cmd.exe /c "npx eslint $archivosTsLista > `"$lintRamaLog`" 2>&1"
  $lintRamaExit = $LASTEXITCODE
  if ($lintRamaExit -eq 0) {
    $lineasResumen += "[PASS] LINT_RAMA | npx eslint (archivos rama) | exit 0 | 0 errores, 0 avisos en $($archivosTs.Count) archivos | $lintRamaLog"
  } else {
    $todasPass = $false
    $lineasResumen += "[FAIL] LINT_RAMA | npx eslint (archivos rama) | exit $lintRamaExit | fallos de lint en rama | $lintRamaLog"
  }
}

# -----------------------------------------------------------------------------
# 4. LINT_GLOBAL
# -----------------------------------------------------------------------------
Write-Host "[4/11] Ejecutando LINT_GLOBAL (sin --fix)..."
$lintGlobalLog = Join-Path $Salida "04_lint_global.log"
cmd.exe /c "npx eslint `"{src,apps,libs,test}/**/*.ts`" > `"$lintGlobalLog`" 2>&1"
$lintGlobalExit = $LASTEXITCODE

$lintGlobalContent = ""
if (Test-Path $lintGlobalLog) {
  $lintGlobalContent = Get-Content $lintGlobalLog -Raw
}

$erroresEncontrados = 0
$avisosEncontrados = 0
if ($lintGlobalContent -match '(\d+)\s+problems\s+\((\d+)\s+errors,\s+(\d+)\s+warnings\)') {
  $erroresEncontrados = [int]$matches[2]
  $avisosEncontrados = [int]$matches[3]
} elseif ($lintGlobalExit -eq 0) {
  $erroresEncontrados = 0
  $avisosEncontrados = 0
}

$cifrasLint = "$erroresEncontrados errores (max: $MaxLintErrores), $avisosEncontrados avisos (max: $MaxLintAvisos)"
if ($erroresEncontrados -le $MaxLintErrores -and $avisosEncontrados -le $MaxLintAvisos) {
  $lineasResumen += "[PASS] LINT_GLOBAL | npx eslint global sin --fix | exit $lintGlobalExit | $cifrasLint | $lintGlobalLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] LINT_GLOBAL | npx eslint global sin --fix | exit $lintGlobalExit | $cifrasLint | $lintGlobalLog"
}

# -----------------------------------------------------------------------------
# 5. UNIT
# -----------------------------------------------------------------------------
Write-Host "[5/11] Ejecutando UNIT (npm test)..."
$unitLog = Join-Path $Salida "05_unit.log"
cmd.exe /c "npm test > `"$unitLog`" 2>&1"
$unitExit = $LASTEXITCODE

$unitContent = ""
if (Test-Path $unitLog) {
  $unitContent = Get-Content $unitLog -Raw
}

$unitSuitesLine = ""
$unitTestsLine = ""
$unitPassed = 0

if ($unitContent -match 'Test Suites:\s*([^\r\n]+)') {
  $unitSuitesLine = $matches[1].Trim()
}
if ($unitContent -match 'Tests:\s*([^\r\n]+)') {
  $unitTestsLine = $matches[1].Trim()
  if ($unitTestsLine -match '(\d+)\s+passed') {
    $unitPassed = [int]$matches[1]
  }
}

$cifrasUnit = "Suites: $unitSuitesLine | Tests: $unitTestsLine (passed: $unitPassed, min: $MinUnit)"
if ($unitExit -eq 0 -and $unitPassed -ge $MinUnit) {
  $lineasResumen += "[PASS] UNIT | npm test | exit 0 | $cifrasUnit | $unitLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] UNIT | npm test | exit $unitExit | $cifrasUnit | $unitLog"
}

# -----------------------------------------------------------------------------
# 6. E2E (Corridas consecutivas)
# -----------------------------------------------------------------------------
Write-Host "[6/11] Ejecutando E2E ($Corridas corridas consecutivas)..."
$e2ePassAll = $true
$e2eDetalles = @()

for ($i = 1; $i -le $Corridas; $i++) {
  Write-Host "   -> Corrida E2E $i de $Corridas..."
  $runLog = Join-Path $Salida "06_e2e_run$i.log"
  cmd.exe /c "npm run test:e2e > `"$runLog`" 2>&1"
  $runExit = $LASTEXITCODE

  $runContent = ""
  if (Test-Path $runLog) {
    $runContent = Get-Content $runLog -Raw
  }

  $suitesLine = ""
  $testsLine = ""
  $timeLine = ""
  $passedCount = 0

  if ($runContent -match 'Test Suites:\s*([^\r\n]+)') {
    $suitesLine = $matches[1].Trim()
  }
  if ($runContent -match 'Tests:\s*([^\r\n]+)') {
    $testsLine = $matches[1].Trim()
    if ($testsLine -match '(\d+)\s+passed') {
      $passedCount = [int]$matches[1]
    }
  }
  if ($runContent -match 'Time:\s*([^\r\n]+)') {
    $timeLine = $matches[1].Trim()
  }

  if ($runExit -ne 0 -or $passedCount -lt $MinE2E) {
    $e2ePassAll = $false
    $todasPass = $false
    $errorDesc = "Corrida $i FALLO (exit: $runExit, passed: $passedCount, min: $MinE2E). Suites: $suitesLine | Time: $timeLine | Log: $runLog"
    $e2eDetalles += $errorDesc
    Write-Host "      ❌ $errorDesc"
    # Detener bucle inmediatamente sin reintentos
    break
  } else {
    $resumenRun = "Run ${i}: Suites: $suitesLine | Tests: $testsLine | Time: $timeLine (exit 0)"
    $e2eDetalles += $resumenRun
    Write-Host "      ✅ $resumenRun"
  }
}

$cifrasE2E = ($e2eDetalles -join " ; ")
if ($e2ePassAll) {
  $lineasResumen += "[PASS] E2E | npm run test:e2e ($Corridas corridas) | exit 0 | $cifrasE2E | $Salida\06_e2e_run*.log"
} else {
  $lineasResumen += "[FAIL] E2E | npm run test:e2e ($Corridas corridas) | fallo en corrida | $cifrasE2E | $Salida\06_e2e_run*.log"
}

# -----------------------------------------------------------------------------
# 7. DB_VERIFY
# -----------------------------------------------------------------------------
Write-Host "[7/11] Ejecutando DB_VERIFY (npm run db:verify)..."
$dbVerifyLog = Join-Path $Salida "07_db_verify.log"
cmd.exe /c "npm run db:verify > `"$dbVerifyLog`" 2>&1"
$dbVerifyExit = $LASTEXITCODE

$dbVerifyContent = ""
if (Test-Path $dbVerifyLog) {
  $dbVerifyContent = Get-Content $dbVerifyLog -Raw
}

$dbVerifyFinal = ""
if ($dbVerifyContent -match '(🎉 ÉXITO:[^\r\n]+|74 pruebas del Anexo D[^\r\n]+)') {
  $dbVerifyFinal = $matches[1].Trim()
} else {
  $lineasDb = Get-Content $dbVerifyLog -Tail 5
  $dbVerifyFinal = ($lineasDb -join " ").Trim()
}

if ($dbVerifyExit -eq 0 -and $dbVerifyContent -match 'cero fallas') {
  $lineasResumen += "[PASS] DB_VERIFY | npm run db:verify | exit 0 | $dbVerifyFinal | $dbVerifyLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] DB_VERIFY | npm run db:verify | exit $dbVerifyExit | $dbVerifyFinal | $dbVerifyLog"
}

# -----------------------------------------------------------------------------
# 8. CONTRATO
# -----------------------------------------------------------------------------
Write-Host "[8/11] Ejecutando CONTRATO (npm run contrato:verificar)..."
$contratoLog = Join-Path $Salida "08_contrato.log"
cmd.exe /c "npm run contrato:verificar > `"$contratoLog`" 2>&1"
$contratoExit = $LASTEXITCODE

$contratoContent = ""
if (Test-Path $contratoLog) {
  $contratoContent = Get-Content $contratoLog -Raw
}

$contratoFinal = ""
if ($contratoContent -match '(\[CONTRATO\][^\r\n]+)') {
  $contratoFinal = $matches[1].Trim()
} else {
  $contratoFinal = (Get-Content $contratoLog -Tail 2 -join " ").Trim()
}

if ($contratoExit -eq 0) {
  $lineasResumen += "[PASS] CONTRATO | npm run contrato:verificar | exit 0 | $contratoFinal | $contratoLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] CONTRATO | npm run contrato:verificar | exit $contratoExit | $contratoFinal | $contratoLog"
}

# -----------------------------------------------------------------------------
# 9. AUDIT (Informativo)
# -----------------------------------------------------------------------------
Write-Host "[9/11] Ejecutando AUDIT informativo..."
$auditJson = Join-Path $Salida "09_audit.json"
cmd.exe /c "npm audit --omit=dev --json > `"$auditJson`" 2>&1"
# npm audit devuelve exit 1 si hay vulnerabilidades, lo cual es normal e informativo
$auditMd = Join-Path $Salida "audit-tabla.md"
$auditResumenLog = Join-Path $Salida "09_audit_resumen.txt"
cmd.exe /c "node scripts/parse-audit.js `"$auditJson`" `"$auditMd`" > `"$auditResumenLog`" 2>&1"

$auditResumenTxt = ""
if (Test-Path $auditResumenLog) {
  $auditResumenTxt = Get-Content $auditResumenLog -Raw
}
$lineasResumen += "[INFO] AUDIT | npm audit --omit=dev --json | informativo | ver audit-tabla.md y bloque adjunto | $auditJson"

# -----------------------------------------------------------------------------
# 10. ALCANCE
# -----------------------------------------------------------------------------
Write-Host "[10/11] Verificando compuerta de ALCANCE CERRADO..."
$alcanceLog = Join-Path $Salida "10_alcance.txt"
$archivosDiff = git diff --name-only "$Base..HEAD"
$archivosDiff | Out-File -FilePath $alcanceLog -Encoding utf8

$permitidosSrcModules = @(
  "src/modules/auth/auth.service.ts",
  "src/modules/auth/auth.service.spec.ts",
  "src/modules/mail/mail.service.spec.ts",
  "src/modules/adjuntos/adjuntos.controller.ts"
)

$alcanceViolado = $false
$motivosAlcance = @()

foreach ($arch in $archivosDiff) {
  $archNorm = $arch.Replace("\", "/")
  if ($archNorm.StartsWith("prisma/migrations/") -or $archNorm -eq "prisma/schema.prisma") {
    $alcanceViolado = $true
    $motivosAlcance += "Modificacion no permitida en base de datos: $archNorm"
  }
  if ($archNorm.StartsWith("src/modules/")) {
    if ($permitidosSrcModules -notcontains $archNorm) {
      $alcanceViolado = $true
      $motivosAlcance += "Modificacion no permitida en src/modules: $archNorm"
    }
  }
}

if (-not $alcanceViolado) {
  $lineasResumen += "[PASS] ALCANCE | git diff --name-only $Base..HEAD | exit 0 | cambios restringidos al alcance autorizado | $alcanceLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] ALCANCE | git diff --name-only $Base..HEAD | violacion de alcance: $($motivosAlcance -join '; ') | $alcanceLog"
}

# -----------------------------------------------------------------------------
# 11. GIT STATUS
# -----------------------------------------------------------------------------
Write-Host "[11/11] Verificando compuerta de GIT STATUS..."
$gitStatusLog = Join-Path $Salida "11_git_status.txt"
$gitStatus = git status --porcelain
$gitStatus | Out-File -FilePath $gitStatusLog -Encoding utf8

$statusInvalido = $false
if ($gitStatus) {
  foreach ($st in $gitStatus) {
    $stTrim = $st.Trim()
    if ($stTrim -and $stTrim -ne "?? prisma/seed-manual.ts") {
      $statusInvalido = $true
    }
  }
}

if (-not $statusInvalido) {
  $lineasResumen += "[PASS] GIT | git status --porcelain | exit 0 | arbol limpio (solo seed-manual tolerado si existe) | $gitStatusLog"
} else {
  $todasPass = $false
  $lineasResumen += "[FAIL] GIT | git status --porcelain | exit 1 | archivos modificados o desversionados pendientes | $gitStatusLog"
}

# -----------------------------------------------------------------------------
# GENERACION DE RESUMEN.txt
# -----------------------------------------------------------------------------
$resumenFile = Join-Path $Salida "RESUMEN.txt"
$bloqueResumen = @()
$bloqueResumen += "================================================================================"
$bloqueResumen += "INFORME MECANICO DE CIERRE DE HITO ($headCommit)"
$bloqueResumen += "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Base: $Base"
$bloqueResumen += "================================================================================"
$bloqueResumen += $lineasResumen
$bloqueResumen += ""
$bloqueResumen += "--------------------------------------------------------------------------------"
$bloqueResumen += "BLOQUE INFORMATIVO DE AUDITORIA (npm audit)"
$bloqueResumen += "--------------------------------------------------------------------------------"
$bloqueResumen += $auditResumenTxt.Trim()
$bloqueResumen += ""
$bloqueResumen += "--------------------------------------------------------------------------------"
if ($todasPass) {
  $bloqueResumen += "VEREDICTO_MECANICO: PASS"
} else {
  $bloqueResumen += "VEREDICTO_MECANICO: FAIL"
}
$bloqueResumen += "================================================================================"

$bloqueResumen | Out-File -FilePath $resumenFile -Encoding utf8

Write-Host "`nResumen generado en: $resumenFile"
Get-Content $resumenFile
