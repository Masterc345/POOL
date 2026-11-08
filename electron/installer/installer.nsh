; PoolMaster3D - custom NSIS include for electron-builder
; Adds: Windows version check, a shortcut-options wizard page, packaged-asset verification,
;       shortcut creation, and an uninstaller that asks before deleting user data.

!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  !include LogicLib.nsh
  !include WinVer.nsh
  !include WinMessages.nsh

  Var PM3D_DesktopCheck
  Var PM3D_StartMenuCheck
  Var PM3D_DesktopState
  Var PM3D_StartMenuState

  Function PM3D_OptionsPageCreate
    GetDlgItem $0 $HWNDPARENT 1037
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Installation options"
    GetDlgItem $0 $HWNDPARENT 1038
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Choose how PoolMaster3D should be set up."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Select the shortcuts to create. On the last page of this wizard you can also choose to launch PoolMaster3D immediately."
    Pop $0

    ${NSD_CreateCheckbox} 0 36u 100% 12u "Create a &Desktop shortcut"
    Pop $PM3D_DesktopCheck
    ${NSD_CreateCheckbox} 0 54u 100% 12u "Create a &Start Menu shortcut"
    Pop $PM3D_StartMenuCheck

    ${If} $PM3D_DesktopState == ${BST_CHECKED}
      ${NSD_Check} $PM3D_DesktopCheck
    ${EndIf}
    ${If} $PM3D_StartMenuState == ${BST_CHECKED}
      ${NSD_Check} $PM3D_StartMenuCheck
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function PM3D_OptionsPageLeave
    ${NSD_GetState} $PM3D_DesktopCheck $PM3D_DesktopState
    ${NSD_GetState} $PM3D_StartMenuCheck $PM3D_StartMenuState
  FunctionEnd
!endif

; ---- Windows compatibility check + defaults (also used by silent installs) ----
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "PoolMaster3D requires Windows 10 or newer (64-bit)."
    Quit
  ${EndIf}
  StrCpy $PM3D_DesktopState ${BST_CHECKED}
  StrCpy $PM3D_StartMenuState ${BST_CHECKED}
!macroend

; ---- Options page after the "installation folder" page ----
!macro customPageAfterChangeDir
  Page custom PM3D_OptionsPageCreate PM3D_OptionsPageLeave
!macroend

; ---- Verify packaged files and create shortcuts ----
!macro customInstall
  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    MessageBox MB_OK|MB_ICONSTOP "Installation verification failed: ${APP_EXECUTABLE_FILENAME} is missing."
    Abort
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\resources\app.asar"
    MessageBox MB_OK|MB_ICONSTOP "Installation verification failed: the game data (app.asar) is missing."
    Abort
  ${EndIf}

  ${If} $PM3D_DesktopState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}
  ${If} $PM3D_StartMenuState == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}
!macroend

; ---- Uninstaller: remove shortcuts, ask before removing user data ----
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
    IfSilent pm3d_keep_data 0
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Do you also want to delete your PoolMaster3D settings, statistics and saved data?$\r$\n$\r$\nChoose No to keep them for a future installation." IDYES pm3d_remove_data IDNO pm3d_keep_data
    pm3d_remove_data:
      SetShellVarContext current
      RMDir /r "$APPDATA\PoolMaster3D"
      SetShellVarContext all
    pm3d_keep_data:
  ${endIf}
!macroend
