# =============================================================================
#  Web 版のエンジンとの突き合わせ用に、ランダムな事件を作る
#   各事件を参照実装（CostEngine.ps1）で計算し、事件と期待値を JSON で書く（tests/golden.mjs が読む）。
#
#   実行: pwsh -NoProfile -File engine/Export-Golden.ps1 -Count 300 -Seed 1 -Out <出力ファイル>
# =============================================================================
#   -WithLabels: 費目名をランダムに入れる（2026-09-30。B説・分属の内訳の摘要＝費目名を「・」でつなぐ所を通すため）。
#                付けないときは費目名は空（乱数の並びも従来のまま）
param([int]$Count = 300, [int]$Seed = 1, [Parameter(Mandatory)][string]$Out, [switch]$WithLabels)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/CostEngine.ps1"
. "$PSScriptRoot/RateCalc.ps1"   # 第3段 3-A: Get-HearingCosts（期日・出欠 → 4号・5号）
. "$PSScriptRoot/Report.ps1"     # Get-CostSubtotals（費用計算書の小計行）

$rng = [System.Random]::new($Seed)
function Rand([int]$lo, [int]$hi) { return $rng.Next($lo, $hi + 1) }          # lo 以上 hi 以下
function Pick([object[]]$xs) { return $xs[$rng.Next(0, $xs.Count)] }
function Chance([double]$p) { return $rng.NextDouble() -lt $p }

# 割合（分子の配列、分母）を作る。n 個の正の分子で合計が den
function Split-Shares([int]$n, [int]$den) {
    $cuts = @(1..($den - 1) | Sort-Object { $rng.Next() } | Select-Object -First ($n - 1) | Sort-Object)
    $nums = @(); $prev = 0
    foreach ($c in $cuts) { $nums += ($c - $prev); $prev = $c }
    $nums += ($den - $prev)
    return $nums
}

function Fx-Text([string]$s) { return '"' + $s.Replace('"', '""') + '"' }
function Fx-Date([datetime]$d) { return "Date($($d.Year),$($d.Month),$($d.Day))" }
function Fx-Bool([bool]$b) { if ($b) { return 'true' } else { return 'false' } }

# 第3段 3-A: 期日・出欠に使う簡易裁判所（docs/courtsaddress.csv の実値）。
#   距離が 0km・数十km・数百km・1000km超に散るように選んである（旅費の全区間を通す）。
$DiffCourts = @(
    [pscustomobject]@{ Key = '東京簡易裁判所';   Lat = 35.67511;  Lon = 139.752594 }
    [pscustomobject]@{ Key = '横浜簡易裁判所';   Lat = 35.446644; Lon = 139.641769 }
    [pscustomobject]@{ Key = '松本簡易裁判所';   Lat = 36.239697; Lon = 137.969406 }
    [pscustomobject]@{ Key = '大阪簡易裁判所';   Lat = 34.695023; Lon = 135.503983 }
    [pscustomobject]@{ Key = '那覇簡易裁判所';   Lat = 26.208338; Lon = 127.686035 }
)
$DiffLodgingCode  = 'SHUKUHAKU_13'
$DiffLodgingRate  = 21000
$DiffAttendeeKinds = @('訴訟代理人', '訴訟代理人', 'その他の法定代理人等', '親権者')

#   【WP5 2026-09-27】出欠の行ごとの出発地（基準の簡裁）の上書き。2 割は別の簡裁、まれに外国（旅費は実費）
# 【WP9 2026-09-28 Q46】出欠の行の費用区分の上書き ― 2 割はその審級の区分（本体を含む）、5% は他の審級の区分（無効＝既定に戻る）
function New-DiffPoolOvr($pools, [int]$instId) {
    $r = Rand 0 99
    if ($r -lt 20) { return [int](Pick @($pools | Where-Object { $_.InstanceId -eq $instId } | ForEach-Object { $_.Id })) }
    if ($r -lt 25) { $o = @($pools | Where-Object { $_.InstanceId -ne $instId } | ForEach-Object { $_.Id }); if ($o.Count -gt 0) { return [int](Pick $o) } }
    return 0
}
function New-DiffSrc {
    $r = $rng.NextDouble()
    if ($r -lt 0.05) { return @{ SrcKind = '外国'; SrcLabel = '外国'; SrcKey = ''; SrcLat = 0; SrcLon = 0 } }
    if ($r -lt 0.25) { $c = Pick $DiffCourts; return @{ SrcKind = '簡裁'; SrcLabel = $c.Key; SrcKey = $c.Key; SrcLat = $c.Lat; SrcLon = $c.Lon } }
    return @{ SrcKind = ''; SrcLabel = ''; SrcKey = ''; SrcLat = 0; SrcLon = 0 }
}

$all = [System.Collections.ArrayList]::new()
for ($caseNo = 1; $caseNo -le $Count; $caseNo++) {
    # --- 当事者（1: 申立人、2..: 相手方。まれに申立人が2人・区分その他） -----------------
    $nParties = Rand 2 4
    $parties = @()
    for ($i = 1; $i -le $nParties; $i++) {
        $kind = if ($i -eq 1) { '申立人' } elseif ($i -eq 2) { '相手方' } else { Pick @('相手方', '相手方', '申立人', 'その他') }
        # 基準の簡裁（第3段 決定B）。4号の距離の始点であり、5号ただし書の上限にも使う
        $court = Pick $DiffCourts
        # IsGov: 国等（案分額の1円未満切捨て。2026-09-27 WP6）
        $parties += [pscustomobject]@{ Id = $i; Kind = $kind; Name = "当事者$i"; ClaimedTotal = $null
                                       CourtKey = $court.Key; Lat = $court.Lat; Lon = $court.Lon; IsGov = (Chance 0.15) }
    }
    if (Chance 0.1) { $parties[0].ClaimedTotal = (Rand 1 60) * 1000 }
    # 本当の相手方（事件を作るときに分かっている側）。請求額・共同支出・相手方の範囲の回答を作るのに使う（計算には渡さない）
    $side = @{}; foreach ($p in $parties) { $side[$p.Id] = if ($p.Kind -eq '申立人') { 'P' } else { 'D' } }

    # --- 審級・費用区分 ----------------------------------------------------------------
    #   【2026-09-27 WP4】まれに同じ審級に費用区分を 2 つ置く（附帯控訴・補助参加・その他）。
    #   2 つ目の区分は一部の当事者の「当事者ごとの費用区分」（PartyPools）にする（4号・5号の区分の決定＝N8 の見張り）。
    #   乱数の費用は当事者と無関係に区分を選ぶ（明細ごとの費用区分。Q19）
    $nInst = Rand 1 2
    $instances = @(); $pools = @(); $partyPools = @()
    for ($k = 1; $k -le $nInst; $k++) {
        $venue = Pick $DiffCourts        # 出頭場所（第2段）
        $instances += [pscustomobject]@{ Id = $k; Rank = $k; Name = "審級$k"
                                         VenueKey = $venue.Key; VenueLat = $venue.Lat; VenueLon = $venue.Lon }
        $pools += [pscustomobject]@{ Id = $pools.Count + 1; InstanceId = $k; Kind = '本体'; Name = "区分$k" }
        if (Chance 0.35) {
            $sub = [pscustomobject]@{ Id = $pools.Count + 1; InstanceId = $k; Kind = (Pick @('附帯控訴', '補助参加', 'その他')); Name = "区分$k-2" }
            $pools += $sub
            foreach ($pp in $parties) {
                if (Chance 0.35) { $partyPools += [pscustomobject]@{ InstanceId = $k; PartyId = $pp.Id; PoolId = $sub.Id } }
            }
        }
    }

    # --- 請求額（1号の按分用。未入力・0円も混ぜる） -------------------------------------
    $claims = @()
    foreach ($k in 1..$nInst) {
        foreach ($a in $parties) { foreach ($b in $parties) {
            if ($a.Id -eq $b.Id -or $side[$a.Id] -eq $side[$b.Id]) { continue }
            if (Chance 0.45) { $claims += [pscustomobject]@{ InstanceId = $k; From = $a.Id; To = $b.Id; Amount = (Pick @(0, 1000000, 2000000, 3000000, 5000000)) } }
        } }
    }

    # --- 条項（審級ごとに 1 つ。上級審は下級の区分も対象にすることがある） ----------------
    #   【2026-09-27 WP4】審級に区分が 2 つあるときは、半々で「1 つの条項で両方」か「2 つ目の区分だけの条項を別に立てる」
    #   （特定費目だけを一方に負担させる主文を、費用区分を分けて入れる形。Q22）
    $rulings = @(); $obSeq = 0
    $rulingPlan = @()
    for ($k = 1; $k -le $nInst; $k++) {
        $own = @($pools | Where-Object { $_.InstanceId -eq $k } | ForEach-Object { [int]$_.Id })
        $lower = @($pools | Where-Object { $_.InstanceId -le $k } | ForEach-Object { [int]$_.Id })
        $sp = @($own[0]); if ($k -ge 2 -and (Chance 0.5)) { $sp = $lower }
        if ($own.Count -ge 2) {
            if (Chance 0.5) { $sp = @($sp + $own[1] | Sort-Object -Unique) }
            else { $rulingPlan += [pscustomobject]@{ Inst = $k; Pools = @($own[1]) } }
        }
        $rulingPlan += [pscustomobject]@{ Inst = $k; Pools = @($sp) }
    }
    $rulingPlan = @($rulingPlan | Sort-Object Inst)
    for ($rix = 0; $rix -lt $rulingPlan.Count; $rix++) {
        $k = [int]$rulingPlan[$rix].Inst
        $scopePools = [int[]]@($rulingPlan[$rix].Pools)
        $scopeParties = @($parties | ForEach-Object { $_.Id })
        # 一部の当事者だけの条項（上級審では多め。下級の区分も対象にすると、相手ごとに条項が分かれて相手方の範囲の問いが出る）
        if ($nParties -ge 3 -and (Chance $(if ($k -ge 2) { 0.45 } else { 0.1 }))) {
            $scopeParties = @($scopeParties | Sort-Object { $rng.Next() } | Select-Object -First (Rand 2 ($nParties - 1)) | Sort-Object)
        }
        $obs = @()
        foreach ($j in $scopeParties) {
            if (Chance 0.03) { continue }                                           # まれに列が無い（V-d）
            $den = Pick @(1, 2, 3, 4, 5, 10)
            $nRows = if ($den -eq 1) { 1 } else { Rand 1 ([Math]::Min(3, $den)) }
            $nums = @(if ($nRows -eq 1) { $den } else { Split-Shares $nRows $den })
            if (Chance 0.03) { $nums[0] += 1 }                                     # まれに列和が 1 でない（V-d）
            foreach ($num in $nums) {
                $cnt = Pick @(1, 1, 1, 2, 2, 3)
                $bearers = @($scopeParties | Sort-Object { $rng.Next() } | Select-Object -First $cnt | Sort-Object)
                $mode = if ($bearers.Count -ge 2 -and (Chance 0.5)) { 'split' } else { 'joint' }
                $obSeq++
                $obs += [pscustomobject]@{ Id = $obSeq; Column = $j; Num = $num; Den = $den; Obligors = [int[]]$bearers; Mode = $mode }
            }
        }
        $rulings += [pscustomobject]@{ Id = $rix + 1; RulingInstanceId = $k; ScopePools = [int[]]$scopePools; ScopeParties = [int[]]$scopeParties; Obligations = $obs }
    }

    # --- 代理人等・期日・出欠（第3段 3-A。4号・5号はここから起こす） ----------------------
    #   代理人等は事件直下（審級ごとではない）。まれに同じ側の 2 当事者を代理する共通代理人
    $attendees = @(); $attendeeParties = @(); $attId = 10
    $nAtt = Rand 0 3
    for ($a = 1; $a -le $nAtt; $a++) {
        $attId++
        $aCourt = Pick $DiffCourts
        $aKind  = Pick $DiffAttendeeKinds
        $attendees += [pscustomobject]@{ Id = $attId; Kind = $aKind; Name = "出頭者$attId"
                                         CourtKey = $aCourt.Key; Lat = $aCourt.Lat; Lon = $aCourt.Lon }
        $forParty = Pick @($parties | ForEach-Object { $_.Id })
        $attendeeParties += [pscustomobject]@{ AttendeeId = $attId; PartyId = $forParty }
        # 共通代理人（同じ側のもう1人も代理する）
        $mates = @($parties | Where-Object { $_.Id -ne $forParty -and $side[$_.Id] -eq $side[$forParty] } | ForEach-Object { $_.Id })
        if ($mates.Count -ge 1 -and (Chance 0.2)) {
            $attendeeParties += [pscustomobject]@{ AttendeeId = $attId; PartyId = (Pick $mates) }
        }
    }

    #   期日は審級ごと。同じ日に 2 件並ぶことがある（判定順 ②）。Seq は同じ日の中の順序
    $hearings = @(); $attendance = @(); $hId = 100
    foreach ($inst in $instances) {
        $nHear = Rand 0 3
        $seqOfDate = @{}
        for ($hh = 1; $hh -le $nHear; $hh++) {
            $hId++
            $hDate = (Get-Date '2025-04-01').AddDays((Rand 0 120))
            $key = $hDate.ToString('yyyy-MM-dd')
            if (-not $seqOfDate.ContainsKey($key)) { $seqOfDate[$key] = 0 }
            $seqOfDate[$key]++
            $hearings += [pscustomobject]@{ Id = $hId; InstanceId = $inst.Id; HDate = $key
                                            Seq = $seqOfDate[$key]
                                            Kind = (Pick @('口頭弁論', '口頭弁論', '弁論準備手続', '')) }
            # 出欠 ― 当事者本人（4号）と代理人等（区分で 4号・5号が決まる）
            foreach ($pp in $parties) {
                if (Chance 0.45) { continue }
                $attendance += [pscustomobject]@{ HearingId = $hId; SubjectKind = 'party'; SubjectId = $pp.Id
                                                  Status = (Pick @('出頭', '出頭', 'Web', '欠席'))
                                                  Days = (Rand 1 2); Nights = $(if (Chance 0.15) { 1 } else { 0 })
                                                  LodgingCode = $DiffLodgingCode
                                                  KmOverride = $(if (Chance 0.1) { Rand 1 900 } else { 0 })
                                                  Within500m = (Chance 0.3); UseActual = (Chance 0.1)
                                                  ActualFare = (Rand 1 200) * 100
                                                  NormalRoute = (Chance 0.7); Receipts = (Chance 0.7)
                                                  CapOverride = 0; Summoned = (Chance 0.25) }
                $src = New-DiffSrc; foreach ($k in $src.Keys) { Add-Member -InputObject $attendance[-1] -NotePropertyName $k -NotePropertyValue $src[$k] }
                Add-Member -InputObject $attendance[-1] -NotePropertyName PoolOverride -NotePropertyValue (New-DiffPoolOvr $pools $inst.Id)   # 【WP9 Q46】
            }
            foreach ($aa in $attendees) {
                if (Chance 0.4) { continue }
                $attendance += [pscustomobject]@{ HearingId = $hId; SubjectKind = 'attendee'; SubjectId = $aa.Id
                                                  Status = (Pick @('出頭', '出頭', 'Web', '欠席'))
                                                  Days = (Rand 1 2); Nights = $(if (Chance 0.15) { 1 } else { 0 })
                                                  LodgingCode = $DiffLodgingCode
                                                  KmOverride = $(if (Chance 0.1) { Rand 1 900 } else { 0 })
                                                  Within500m = (Chance 0.3); UseActual = (Chance 0.1)
                                                  ActualFare = (Rand 1 200) * 100
                                                  NormalRoute = (Chance 0.7); Receipts = (Chance 0.7)
                                                  CapOverride = $(if (Chance 0.05) { (Rand 1 60) * 100 } else { 0 })
                                                  Summoned = (Chance 0.25) }
                $src = New-DiffSrc; foreach ($k in $src.Keys) { Add-Member -InputObject $attendance[-1] -NotePropertyName $k -NotePropertyValue $src[$k] }
                Add-Member -InputObject $attendance[-1] -NotePropertyName PoolOverride -NotePropertyValue (New-DiffPoolOvr $pools $inst.Id)   # 【WP9 Q46】
            }
        }
    }
    $hearingCase = [pscustomobject]@{
        Parties = $parties; Attendees = $attendees; AttendeeParties = $attendeeParties
        Instances = $instances; Pools = $pools; PartyPools = $partyPools
        Hearings = $hearings; Attendance = $attendance
    }
    # 単価区間は割らない（区間の割り方そのものは TC-18・TC-19 で守られている）
    $hearingResult = Get-HearingCosts -Case $hearingCase -LodgingRates @{ $DiffLodgingCode = $DiffLodgingRate }

    # --- 費用（4号・5号は上で起こすので、ここでは作らない） --------------------------------
    $costs = @()
    $nCosts = Rand 1 7
    for ($c = 1; $c -le $nCosts; $c++) {
        $pool = Pick @($pools | ForEach-Object { $_.Id })
        $item = Pick @(1, 1, 2, 6, 7)
        $amount = (Rand 1 60) * (Pick @(100, 250, 1000)) + (Pick @(0, 0, 1, 5))
        $party = Pick @($parties | ForEach-Object { $_.Id })
        $payers = @()
        $sameSide = @($parties | Where-Object { $side[$_.Id] -eq $side[$party] } | ForEach-Object { $_.Id })
        if ($sameSide.Count -ge 2 -and (Chance 0.2)) { $payers = [int[]]@($sameSide | Sort-Object); $party = 0 }
        $rel = 0
        if (Chance 0.2) { $rel = Pick @($parties | ForEach-Object { $_.Id }) }
        # 確定処分の申立てに関する費用（11条1項。催告書送付費用・処分正本送達費用）。計算書の小計が分かれる（第4段 要判断4）
        $appCost = (Chance 0.15)
        $label = if ($WithLabels) { Pick @('', '', '手数料', '手数料 （追加分）', '送達費用', '訴状等送達費用', '判決正本送達費用', '書類作成費用') } else { '' }
        $costs += [pscustomobject]@{ PoolId = $pool; PartyId = $party; Item = $item; Amount = $amount; RelatedId = $rel; Payers = $payers; Label = $label; AppCost = $appCost }
    }
    # 参照実装には「乱数の費用 ＋ 期日から起こした4号・5号」を渡す。
    $allCosts = @($costs) + @($hearingResult.CostRows | ForEach-Object {
        [pscustomobject]@{ PoolId = $_.PoolId; PartyId = 0; Item = $_.Item; Amount = $_.Amount
                           RelatedId = 0; Payers = [int[]]$_.Payers; Label = $_.Label; AppCost = $false } })

    $opt = @{}
    if (Chance 0.08) { $opt.OpponentMode = 'B'; $opt.OpponentIds = @(2) }
    $ct = @{}; if ($null -ne $parties[0].ClaimedTotal) { $ct[1] = [int]$parties[0].ClaimedTotal }
    $opt.ClaimedTotals = $ct

    # --- 相手方の範囲の回答（2026-09-15 第1段A） ----------------------------------------------
    #   回答なしで一度計算して問いを得て、本当の相手方（側が違う候補）を「含める」とする。まれに回答漏れ（V2b）
    $r0 = Invoke-CostCalculation (New-Case -Parties $parties -Instances $instances -Pools $pools -Claims $claims -Rulings $rulings -Costs $allCosts -Options $opt)
    $scopes = @()
    foreach ($q in $r0.ScopeQuestions) {
        if (Chance 0.03) { continue }
        $scopes += [pscustomobject]@{ PoolId = $q.PoolId; PartyId = $q.PartyId; OpponentId = $q.OpponentId; Included = ($side[$q.PartyId] -ne $side[$q.OpponentId]) }
    }

    $case = New-Case -Parties $parties -Instances $instances -Pools $pools -Claims $claims -Rulings $rulings -Costs $allCosts -Options $opt -OpponentScopes $scopes
    $r = Invoke-CostCalculation $case


    $decree = @(Get-Decree $case $r)
    $sheet2 = @(Get-Sheet2 $case $r | ForEach-Object { [ordered]@{ Seq=$_.Seq; Kind=$_.Kind; No=$_.No; Text=$_.Text; Amount=$_.Amount; Paren=$_.Paren; PartyId=$_.PartyId; Note=$_.Note } })
    $subs = @(Get-CostSubtotals $case $r | ForEach-Object { [ordered]@{ PoolId=$_.PoolId; PartyId=$_.PartyId; Name=$_.Name; Amount=$_.Amount } })
    [void]$all.Add([ordered]@{
        caseNo = $caseNo
        hearingCase = $hearingCase
        lodging = @{ $DiffLodgingCode = $DiffLodgingRate }
        case = [ordered]@{ Parties=$case.Parties; Instances=$case.Instances; Pools=$case.Pools; OpponentScopes=$case.OpponentScopes; Claims=$case.Claims; Rulings=$case.Rulings; Costs=$case.Costs
                   Options=[ordered]@{ OpponentMode=$case.Options.OpponentMode; OpponentIds=@($case.Options.OpponentIds); ClaimedTotals=$(  $h=[ordered]@{}; foreach($k in $case.Options.ClaimedTotals.Keys){ $h["$k"]=$case.Options.ClaimedTotals[$k] }; $h ) } }
        expect = [ordered]@{
            Normalized = @($r.Normalized); NotOrdered = @($r.NotOrderedNormalized)
            Errors = @($r.Errors); Warnings = @($r.Warnings); Diffs = @($r.Diffs); Notes = @($r.Notes)
            OffsetLog = @($r.OffsetLog)
            Questions = @($r.ScopeQuestions | ForEach-Object { [ordered]@{ PoolId=$_.PoolId; PartyId=$_.PartyId; OpponentId=$_.OpponentId; RulingId=$_.RulingId; Suggested=$_.Suggested } })
            BaseAmounts = $r.BaseAmounts
            Debts = @($r.Debts | ForEach-Object { [ordered]@{ Creditor=$_.Creditor; Obligors=@($_.Obligors); Amount=$_.Amount } })
            HRows = @($hearingResult.Rows | ForEach-Object { [ordered]@{ RKey=$_.RKey; PoolId=$_.PoolId; Item=$_.Item; Km=$_.Km; Fare=$_.Fare; Daily=$_.Daily; Lodge=$_.Lodge; Amount=$_.Amount; Cap=$_.Cap; Dropped=$_.Dropped } })
            HWarnings = @($hearingResult.Warnings)
            HCosts = @($hearingResult.CostRows | ForEach-Object { [ordered]@{ PoolId=$_.PoolId; Item=$_.Item; SegNo=$_.SegNo; Amount=$_.Amount; Label=$_.Label; Payers=@($_.Payers) } })
            Decree = $decree; Sheet2 = $sheet2; CostSubtotals = $subs
        }
    })
}
$json = $all | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "$Count 件を書き出した: $Out"
