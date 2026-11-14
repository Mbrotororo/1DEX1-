' Launches _music.ps1 hidden so the song plays with no visible window.
Dim dir
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
CreateObject("WScript.Shell").Run _
  "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "_music.ps1""", 0, False
