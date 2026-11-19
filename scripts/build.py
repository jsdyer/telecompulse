"""Download CRTC pricing and availability tables and build static Pages assets."""
import argparse
from collections import defaultdict
import csv
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import shutil
import tempfile
import time
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
CRTC = 'https://applications.crtc.gc.ca/OpenData/CASP/COMMUNICATION%20MONITORING%20REPORTS/'
AVAILABILITY = CRTC + 'Telecommunications%20Overview/English/data-mobile-and-broadband-availability.zip'
PRICING = CRTC + 'Communications%20Services%20Pricing%20in%20Canada/Year-End%20Monthly%20Reported%20Prices%20for%20Internet%2C%20Mobile%20and%20TV%20services/English/data-communications-services-pricing-in-canada.zip'
PROVINCES = {
    'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick',
    'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories',
    'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec',
    'SK': 'Saskatchewan', 'YT': 'Yukon',
}
METRICS = {'AllDemographics': 0, '50/10/U': 2, 'Gigabit': 3, 'LTE': 4, 'NR': 5}
AREAS = {'Rural': 'Rural', 'Small': 'Small population centre', 'Medium': 'Medium population centre', 'Large': 'Large urban population centre'}


def download(url, path):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'CoolCode Telecom Pulse data build'}), timeout=90) as source, path.open('wb') as target:
                for chunk in iter(lambda: source.read(512 * 1024), b''):
                    target.write(chunk)
                    if target.tell() > 90 * 1024 * 1024:
                        raise ValueError('Source archive exceeded the expected download limit.')
            return
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def values(raw):
    try:
        number = float(raw)
    except ValueError:
        return None
    return number if math.isfinite(number) and number >= 0 else None


def availability(path, data):
    locations = {}
    with ZipFile(path) as archive, archive.open('C-T9.csv') as member:
        rows = csv.reader(io.TextIOWrapper(member, encoding='cp1252', newline=''))
        header = next(row for row in rows if row[0] == 'ProvinceID')
        if len(header) < 16 or not header[9].endswith('Usual Resident Dwellings') or header[13] != 'Population':
            raise ValueError('Availability table columns changed.')
        for row in rows:
            if len(row) < 16:
                continue
            province, code, name, area, reserve, metric, year = row[1:8]
            if metric not in METRICS or province not in PROVINCES or not code.isdigit() or not year.isdigit():
                continue
            if reserve not in ('TRUE', 'FALSE'):
                raise ValueError('Unexpected reserve area flag.')
            area_key = area.split(' / ')[-1].split()[0]
            if area_key not in AREAS:
                raise ValueError(f'Unexpected population centre category: {area}')
            key = (province, code, area_key, reserve == 'TRUE')
            location = locations.setdefault(key, [name, {}])
            series = location[1].setdefault(int(year), [None] * 6)
            index = METRICS[metric]
            measure = [values(row[9]), values(row[13])] if index == 0 else [values(row[9 if index < 4 else 13])]
            for offset, value in enumerate(measure, index):
                if series[offset] is not None and series[offset] != value:
                    raise ValueError(f'Different estimates for a single availability series: {key} {year} {metric}')
                series[offset] = value
    shards = defaultdict(list)
    for (province, code, area, reserve), (name, series) in locations.items():
        complete = [[year, *record] for year, record in sorted(series.items()) if any(value is not None for value in record[:2])]
        if complete:
            shards[province].append([name, code, AREAS[area], reserve, complete])
    if len(shards) != len(PROVINCES) or len(locations) < 4000:
        raise ValueError('Availability archive did not produce the expected geographic coverage.')
    for province, records in shards.items():
        write(data / f'{province}.json', sorted(records, key=lambda row: (row[0].casefold(), row[1], row[2], row[3])))
    return sum(len(records) for records in shards.values())


def pricing(path, data):
    observations = {}
    with ZipFile(path) as archive:
        for service in ('Internet', 'Mobile'):
            filename = next(item for item in archive.namelist() if item.endswith(f'Moyennes-Averages {service}.csv'))
            with archive.open(filename) as member:
                rows = csv.reader(io.TextIOWrapper(member, encoding='cp1252', newline=''))
                header = next(rows)
                if header[4] != 'Plan' or 'Average' not in header[5]:
                    raise ValueError('Pricing table columns changed.')
                for year, region, province, _, plan, raw, *tier in rows:
                    if (province not in PROVINCES and province != 'Canada') or not year.isdigit() or not plan:
                        continue
                    price = values(raw)
                    if price is None:
                        continue
                    tier_name = tier[0].split(' / ')[-1] if tier else ''
                    key = (service, province, region.split(' / ')[-1], plan, tier_name, int(year))
                    if key in observations and observations[key] != price:
                        raise ValueError(f'Different averages for a single pricing series: {key}')
                    observations[key] = price
        member = next(name for name in archive.namelist() if name.endswith('/Prix-Prices.csv'))
        reports = defaultdict(list)
        baskets = {(province, plan, tier, year) for _, province, _, plan, tier, year in observations}
        with archive.open(member) as source:
            rows = csv.reader(io.TextIOWrapper(source, encoding='cp1252', newline=''))
            header = next(rows)
            if len(header) != 11 or header[6] != 'Plan' or 'Reported monthly price' not in header[7]:
                raise ValueError('Pricing report columns changed.')
            for year, entity, region, community, province, _, plan, raw, brand, speed, _ in rows:
                if not year.isdigit():
                    continue
                tier = speed.split(' / ')[-1]
                price = values(raw)
                if price is not None and (province, plan, tier, int(year)) in baskets:
                    reports[province].append([int(year), region.split(' / ')[-1], plan, tier, community, brand or entity, price])
        if set(reports) != set(PROVINCES):
            raise ValueError('Incomplete geographic coverage in pricing reports.')
        for province, records in reports.items():
            write(data / f'prices-{province}.json', sorted(records))
    if len(observations) < 1000:
        raise ValueError('Pricing archive did not produce expected observations.')
    write(data / 'pricing.json', [[*key, price] for key, price in sorted(observations.items())])
    return len(observations)


def write(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--availability-zip', type=Path)
    parser.add_argument('--pricing-zip', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='telecompulse-', dir=ROOT) as temporary:
        temp = Path(temporary)
        staged = temp / 'site'
        shutil.copytree(ROOT / 'web', staged)
        data = staged / 'data'
        data.mkdir()
        availability_zip = args.availability_zip or temp / 'availability.zip'
        pricing_zip = args.pricing_zip or temp / 'pricing.zip'
        if args.availability_zip is None:
            download(AVAILABILITY, availability_zip)
        if args.pricing_zip is None:
            download(PRICING, pricing_zip)
        regions = availability(availability_zip, data)
        prices = pricing(pricing_zip, data)
        write(data / 'manifest.json', {
            'built': datetime.now(timezone.utc).isoformat(), 'provinces': PROVINCES,
            'availability': AVAILABILITY, 'pricing': PRICING, 'places': regions, 'prices': prices,
        })
        dest = ROOT / 'dist'
        if dest.exists():
            shutil.rmtree(dest)
        staged.replace(dest)
    print(f'{regions:,} coverage areas and {prices:,} pricing observations.')


if __name__ == '__main__':
    main()
