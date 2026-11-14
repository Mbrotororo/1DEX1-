' ==========================================================
'  PRANK USB watcher - zapuskaet prikol, kogda vstavlena
'  fleshka s metkoy toma  PRANK  (tolko na ETOM kompe).
'  Udalit: zapusti  UDALIT-avtozapusk.bat
' ==========================================================
Option Explicit
Dim sh, fso, selfDir, startBat
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
selfDir = fso.GetParentFolderName(WScript.ScriptFullName)
startBat = fso.BuildPath(selfDir, "START.bat")

Dim wmi, events, evt, d
On Error Resume Next
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set events = wmi.ExecNotificationQuery( _
  "SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2")
If Err.Number <> 0 Then WScript.Quit

Do
  Set evt = events.NextEvent() : WScript.Sleep 800
  For Each d In fso.Drives
    If d.IsReady Then
      If d.DriveType = 1 Then            ' 1 = removable (USB stick)
        If UCase(d.VolumeName) = "PRANK" Then
          sh.Run """" & startBat & """", 0, False
          Exit For
        End If
      End If
    End If
  Next
Loop
