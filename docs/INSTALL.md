# Installing PoolMaster3D (Windows 10 / 11, 64-bit)

1. Double-click **PoolMaster3D-Setup.exe**.
   * If Windows SmartScreen shows "Windows protected your PC" (the installer is not code-signed), click **More info -> Run anyway**.
2. **Welcome** page: click *Next*.
3. **Installation folder**: the default is `C:\Program Files\PoolMaster3D`. Click *Browse* to choose another folder.
4. **Installation options**: tick *Desktop shortcut* and/or *Start Menu shortcut*.
5. **Installing**: wait for the progress bar to finish.
6. **Finish**: leave *Run PoolMaster3D* ticked and click *Finish* - the game opens in the main menu.

Afterwards start the game from the Desktop shortcut, the Start Menu, or by searching "PoolMaster3D". No other software is required and no internet connection is needed to play.

## Where settings are stored
`%APPDATA%\PoolMaster3D\` (`settings.json`, `stats.json`). They are created the first time the game runs.

## Uninstalling
*Settings -> Apps -> Installed apps -> PoolMaster3D -> Uninstall* (or the uninstaller in the install folder).
The uninstaller removes the program and shortcuts and **asks** whether to delete your settings and statistics; choose *No* to keep them.

## Silent install (IT deployment)
`PoolMaster3D-Setup.exe /S /D=C:\Games\PoolMaster3D` (both shortcuts are created by default).
