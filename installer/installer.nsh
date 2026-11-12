; electron-builder 26.18.0 checks for a running app through PowerShell. In Windows
; PowerShell 5.1, .Count on a single CimInstance is empty, so a lone Walnut process can be
; missed; a main process that survives quitAndInstall() also keeps files locked.
;
; This macro replaces that check entirely (customCheckAppRunning is inserted instead of the
; built-in one), so it does its own detection, closes the app tree, forces it, and only then
; offers the same Retry/Cancel message for a process this user may not terminate.
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro customCheckAppRunning
  app_running_check:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      DetailPrint "$(appClosing)"

      ; Ask the window to close first, so unsaved state has a chance to settle.
      nsExec::Exec `"$SYSDIR\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}" /T`
      Pop $R0
      Sleep 1500

      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 == 0
        ; Still there: force-close the whole tree, which is what an in-app update needs
        ; when the old main process outlives quitAndInstall().
        nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}" /T`
        Pop $R0
        Sleep 1500

        ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        ${If} $R0 == 0
          ; An elevated Walnut cannot be closed from a non-elevated installer. Let the user
          ; retry instead of letting the install fail halfway through.
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY app_running_check
          Quit
        ${EndIf}
      ${EndIf}
    ${EndIf}

  ; Walnut 2.0.14 and 2.0.15 shipped with electron-builder's broken PowerShell process
  ; check. Their uninstaller can fail its own check and block an upgrade behind
  ; $(appCannotBeClosed) five times even when no Walnut process exists. This installer
  ; replaces the app tree and writes a fresh uninstaller and registry entry, so skip the
  ; legacy uninstaller during installation instead of letting it abort the upgrade.
  !ifndef BUILD_UNINSTALLER
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  !endif
!macroend
