"""Boot the actual simulator build and retain a screenshot and startup evidence."""
import json
import re
import subprocess
import time
from pathlib import Path


def sim(*args, check=True):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, capture_output=True, text=True)


def main():
    output = Path('build/ios/verification')
    output.mkdir(parents=True, exist_ok=True)
    devices = json.loads(sim('list', 'devices', 'available', '--json').stdout)['devices']
    candidates = [(runtime, device) for runtime, items in devices.items()
                  if '.iOS-' in runtime for device in items if device['name'].startswith('iPhone')]
    if not candidates:
        raise RuntimeError('No installed iPhone simulator runtime. Install one in Xcode first.')
    runtime, template = candidates[-1]
    device_type = template.get('deviceTypeIdentifier')
    if not device_type:
        types = json.loads(sim('list', 'devicetypes', '--json').stdout)['devicetypes']
        device_type = next(item['identifier'] for item in types if item['name'] == template['name'])
    device = sim('create', 'GymBank CI', device_type, runtime).stdout.strip()
    try:
        sim('boot', device)
        sim('bootstatus', device, '-b')
        sim('status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
        sim('install', device, 'build/ios/iphonesimulator/Runner.app')
        launch = sim('launch', device, 'net.shotech.gymbank')
        (output / 'launch.txt').write_text(launch.stdout + launch.stderr)
        match = re.search(r'net\.shotech\.gymbank:\s*(\d+)', launch.stdout)
        if not match:
            raise RuntimeError('Simulator did not return an application process ID')
        # Allow restoration, native Keychain access and the first rendered form.
        time.sleep(15)
        processes = sim('spawn', device, 'launchctl', 'list').stdout
        alive = [line for line in processes.splitlines()
                 if 'net.shotech.gymbank' in line and line.split()[0] == match[1]]
        (output / 'process.txt').write_text('\n'.join(alive))
        if not alive:
            raise RuntimeError('GymBank exited during simulator startup')
        sim('io', device, 'screenshot', str(output / 'iphone-startup.png'))
        (output / 'runtime.json').write_text(json.dumps({
            'bundleId': 'net.shotech.gymbank', 'runtime': runtime,
            'device': template['name'], 'processRunningAfterSeconds': 15,
            'scope': 'Startup smoke check only; no camera/GPS or signed-device validation',
        }, indent=2))
        print('GymBank started and remained running; iPhone screenshot saved.')
    finally:
        sim('shutdown', device, check=False)
        sim('delete', device, check=False)


if __name__ == '__main__':
    main()
