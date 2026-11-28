# Web 版の突き合わせ用: アプリの退避 JSON（tools/scenario/json/*.json・engine/samples/*.json）を参照実装で計算して期待値を書く
param([Parameter(Mandatory)][string]$Out, [Parameter(Mandatory)][string]$Masters, [string[]]$Files)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../engine/CostEngine.ps1"
. "$PSScriptRoot/../../engine/Report.ps1"
. "$PSScriptRoot/../../engine/RateCalc.ps1"
. "$PSScriptRoot/../../engine/CaseJson.ps1"
$m = Get-Content $Masters -Raw -Encoding UTF8 | ConvertFrom-Json
$master = @($m.rates | ForEach-Object { [pscustomobject]@{ ItemCode = $_.ItemCode; EffectiveDate = [datetime]$_.EffectiveDate; Amount = [int]$_.Amount
    AbolishedDate = $(if ($_.AbolishedDate) { [datetime]$_.AbolishedDate } else { $null }); FilingBasis = [bool]$_.FilingBasis } })
$all = [System.Collections.ArrayList]::new()
foreach ($f in $Files) {
    $json = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
    $case = ConvertTo-Case $json
    $r = Invoke-CostCalculation $case
    $h = $null
    if ($json.PSObject.Properties.Name -contains 'hearings' -and @($json.hearings).Count -gt 0) {
        $hc = ConvertTo-HearingCase $json
        $spans = Get-InstanceSpans $hc.Instances
        $segs = @()
        foreach ($pl in $hc.Pools) {
            $sp = @($spans | Where-Object { $_.InstanceId -eq $pl.InstanceId })[0]
            foreach ($it in 4, 5) {
                $codes = Get-ItemRateCodes -Master $master -Item $it
                $ss = @(Get-RateSegments -Start $sp.StartDate -End $sp.EndDate -Master $master -Codes $codes -FilingDate $sp.FilingDate)
                foreach ($s in $ss) {
                    $rt = Get-SegmentRates -Master $master -Codes $codes -Date $s.From -FilingDate $sp.FilingDate
                    $segs += [pscustomobject]@{ PoolId = $pl.Id; Item = $it; SegNo = $s.SegNo; From = $s.From; To = $s.To; Rates = $rt; LodgingRates = $rt
                                                Missing = (@(Get-MissingRateCodes -Master $master -Item $it -Date $s.From -FilingDate $sp.FilingDate) -join '、') }
                }
            }
        }
        $hr = Get-HearingCosts -Case $hc -Segments $segs
        $h = [ordered]@{
            Rows = @($hr.Rows | ForEach-Object { [ordered]@{ RKey=$_.RKey; PoolId=$_.PoolId; SegNo=$_.SegNo; Item=$_.Item; Km=$_.Km; Fare=$_.Fare; Daily=$_.Daily; Lodge=$_.Lodge; Amount=$_.Amount; Cap=$_.Cap; Dropped=$_.Dropped } })
            Warnings = @($hr.Warnings)
            CostRows = @($hr.CostRows | ForEach-Object { [ordered]@{ PoolId=$_.PoolId; Item=$_.Item; SegNo=$_.SegNo; Amount=$_.Amount; Label=$_.Label; Payers=@($_.Payers) } })
        }
    }
    [void]$all.Add([ordered]@{
        file = [IO.Path]::GetFileName($f)
        Normalized = @($r.Normalized); NotOrdered = @($r.NotOrderedNormalized)
        Errors = @($r.Errors); Warnings = @($r.Warnings); Diffs = @($r.Diffs); Notes = @($r.Notes); OffsetLog = @($r.OffsetLog)
        Decree = @(Get-Decree $case $r)
        Sheet2 = @(Get-Sheet2 $case $r | ForEach-Object { [ordered]@{ Seq=$_.Seq; Kind=$_.Kind; No=$_.No; Text=$_.Text; Amount=$_.Amount; Paren=$_.Paren; PartyId=$_.PartyId; Note=$_.Note } })
        CostSubtotals = @(Get-CostSubtotals $case $r | ForEach-Object { [ordered]@{ PoolId=$_.PoolId; PartyId=$_.PartyId; Name=$_.Name; Amount=$_.Amount } })
        Hearing = $h
    })
}
[IO.File]::WriteAllText($Out, ($all | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
Write-Host "$($all.Count) 件: $Out"
