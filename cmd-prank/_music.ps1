# Plays track.mp3 in the background on loop for ~5 minutes. Benign: local audio only.
Add-Type -AssemblyName presentationCore
$path = Join-Path $PSScriptRoot 'track.mp3'
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$path)
Start-Sleep -Milliseconds 400
$player.Volume = 1.0
$end = (Get-Date).AddSeconds(300)
while ((Get-Date) -lt $end) {
    $player.Position = [TimeSpan]::Zero
    $player.Play()
    Start-Sleep -Seconds 82
}
$player.Stop()
$player.Close()
