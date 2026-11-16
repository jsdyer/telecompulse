# Telecom Pulse

[Open on CoolCode.ca](https://coolcode.ca/telecompulse/). Compare network availability for a Canadian census subdivision area with the historical pricing for the same province and a national benchmark. Start with Langley in BC or select Nova Scotia to browse Halifax. Change the area type, availability measure, service, survey market, plan, and mobile speed independently. The CSV keeps the local and provincial scope in separate columns.

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
