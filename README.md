# Telecom Pulse

[Open on CoolCode.ca](https://coolcode.ca/telecompulse/). Compare network availability for a Canadian census subdivision area with the historical pricing for the same province and a national benchmark. Start with Langley in BC or select Nova Scotia to browse Halifax. Change the area type, availability measure, service, survey market, plan, and mobile speed independently. The CSV keeps the local and provincial scope in separate columns.

<!-- coolcode:guide -->
Open the Oxford example, then expand the provider offers and switch between 2024 and 2025. The province’s survey average changes with the mix of offers in Bear River, Mahone Bay and Wedgeport.
<!-- /coolcode:guide -->

[Open the Oxford coverage and price example](https://coolcode.ca/telecompulse/?example=oxford).

## What happened in Oxford?

In CRTC coverage table `C-T9.csv`, filter to census subdivision 1211012, rural, reserve flag FALSE. The Gigabit row gives 13.37120304 covered usual-resident dwellings in both 2024 and 2025. The AllDemographics row gives 533, producing 2.51%. CRTC estimates coverage using geographic points representing multiple households. The 2022 and 2023 rows have a dwelling base but no Gigabit entry. In 2021 the published figures were 481.1949405 of 528 (91.14%). The table gives no local explanation for the break. CRTC calls the 2025 high-speed broadband figures preliminary. [Coverage methodology](https://crtc.gc.ca/eng/publications/reports/PolicyMonitoring/fac.htm) · [Release history](https://crtc.gc.ca/eng/publications/reports/policymonitoring/chg.htm).

The pricing archive's `Moyennes-Averages Internet.csv` gives $189.00 for rural Nova Scotia and $122.79 for rural Canada in 2024. In 2025 the respective 50/10 Mbps averages were $103.31 and $79.02. In `Prix-Prices.csv`, Bear River, Mahone Bay and Wedgeport each have one offer in 2024 (Starlink, $189). All three exchanges have Bell ($122), City Wide ($57.95) and Xplore ($129.99) in 2025. Oxford has no rows in this sample. Canadian rural averages combine provincial and northern averages. Each year describes that year's reported offers. [CRTC pricing method](https://crtc.gc.ca/eng/publications/reports/PolicyMonitoring/comm.htm).

## Data and interpretation

- [CRTC mobile and broadband availability](https://open.canada.ca/data/en/dataset/bd41f23a-6dbc-45ee-9419-422153aff567) Table 9. Coverage divides the published covered estimate by the matching AllDemographics estimate within the same census subdivision, population centre type, reserve-area flag, and year. Broadband uses usual resident dwellings and mobile uses population. Each area remains separate, and missing numerator/denominator pairs are unavailable.
- [CRTC reported prices](https://open.canada.ca/data/en/dataset/8bde476f-49e1-455d-9705-77e6ffab72ca) published Internet and Mobile Averages tables. These compare the same plan, speed and survey market by province and nationally. The archive includes newer rows than the catalogue title. The app shows each observation’s actual survey year. Survey prices are reported for December 1.
- Data is provided under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). See the CRTC [facilities survey methodology](https://crtc.gc.ca/eng/publications/reports/PolicyMonitoring/fac.htm) and [pricing survey methodology](https://crtc.gc.ca/eng/publications/reports/PolicyMonitoring/comm.htm).

The location influences the default pricing market (urban or rural), which can be changed. Prices describe the survey market and province. Coverage describes the local statistical area. These geographic scopes stay visible in the interface and download.

## Build

```sh
python3 scripts/build.py
python3 -m http.server --directory dist 8000
```

The Python build accepts `--availability-zip` and `--pricing-zip` to reproduce a local snapshot. It downloads both CRTC ZIPs by default. GitHub Pages builds on pushes to main, on demand, and weekly.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->
