$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$voiceRequest=[Console]::In.ReadToEnd() | ConvertFrom-Json
$voiceSynth=$null
$voiceRecognizer=$null
$voiceStream=$null
try {
  if($voiceRequest.action -eq 'info') {
    $voiceSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
    $voiceList=@($voiceSynth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{name=$_.VoiceInfo.Name;culture=$_.VoiceInfo.Culture.Name} })
    $recognizerList=@([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { @{id=$_.Id;culture=$_.Culture.Name} })
    @{voices=$voiceList;recognizers=$recognizerList} | ConvertTo-Json -Compress -Depth 4
  } elseif($voiceRequest.action -eq 'speak') {
    $voiceSynth=New-Object System.Speech.Synthesis.SpeechSynthesizer
    if($voiceRequest.voice){$voiceSynth.SelectVoice([string]$voiceRequest.voice)}
    $voiceSynth.Rate=[int]$voiceRequest.rate
    $voiceSynth.Volume=100
    $voiceStream=New-Object System.IO.MemoryStream
    $voiceSynth.SetOutputToWaveStream($voiceStream)
    $voiceSynth.Speak([string]$voiceRequest.text)
    $voiceSynth.SetOutputToNull()
    @{data=[Convert]::ToBase64String($voiceStream.ToArray());mime='audio/wav'} | ConvertTo-Json -Compress
  } elseif($voiceRequest.action -eq 'transcribe') {
    $recognizerInfo=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object {$_.Culture.Name -eq 'zh-CN'} | Select-Object -First 1
    if(!$recognizerInfo){throw 'Chinese speech recognition is not installed.'}
    $voiceRecognizer=New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo)
    $voiceRecognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
    $voiceStream=New-Object System.IO.MemoryStream(,[Convert]::FromBase64String([string]$voiceRequest.data))
    $voiceRecognizer.SetInputToWaveStream($voiceStream)
    $voiceRecognizer.InitialSilenceTimeout=[TimeSpan]::FromSeconds(3)
    $voiceRecognizer.EndSilenceTimeout=[TimeSpan]::FromMilliseconds(600)
    $voiceRecognizer.BabbleTimeout=[TimeSpan]::FromSeconds(25)
    $voiceParts=New-Object 'System.Collections.Generic.List[string]'
    $voiceConfidence=0.0
    for($voiceIndex=0;$voiceIndex -lt 30;$voiceIndex++) {
      try {$voiceResult=$voiceRecognizer.Recognize([TimeSpan]::FromSeconds(25))}
      catch {
        # SAPI detaches the WAV input at EOF, after delivering its last result.
        if($voiceParts.Count -gt 0 -and $_.Exception.InnerException -is [System.InvalidOperationException]){break}
        throw
      }
      if(!$voiceResult){break}
      $voiceParts.Add($voiceResult.Text)
      $voiceConfidence+=$voiceResult.Confidence
    }
    if($voiceParts.Count){@{text=($voiceParts -join ' ');confidence=($voiceConfidence/$voiceParts.Count)} | ConvertTo-Json -Compress}
    else {@{text='';confidence=0} | ConvertTo-Json -Compress}
  } else {throw 'Unknown voice operation.'}
} finally {
  if($voiceRecognizer){$voiceRecognizer.Dispose()}
  if($voiceSynth){$voiceSynth.Dispose()}
  if($voiceStream){$voiceStream.Dispose()}
}
