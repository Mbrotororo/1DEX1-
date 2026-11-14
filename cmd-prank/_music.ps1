# Plays track.mp3 in the background (no window). Benign: only local audio.
Add-Type -AssemblyName presentationCore
$path = Join-Path $PSScriptRoot 'track.mp3'
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$path)
$player.Volume = 1.0
$player.Play()
Start-Sleep -Seconds 48
$player.Stop()
$player.Close()
