"""Boot the actual simulator build and retain a screenshot and startup evidence."""
import json
import re
import subprocess
import time
from pathlib import Path


def sim(*args, check=True):
    print('Simulator step: ' + args[0], flush=True)
    try:
        # A fresh hosted simulator can finish booting before its installer is ready.
        # Keep installation bounded, while allowing the same cold-start budget as boot.
        timeout = 300 if args[0] in {'bootstatus', 'install'} else 90
        result = subprocess.run(['xcrun', 'simctl', *args], timeout=timeout,
                                capture_output=True, text=True)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError('Simulator command timed out: ' + args[0]) from error
    if check and result.returncode:
        raise RuntimeError('Simulator command failed: ' + args[0] + '\n' + result.stdout[-2000:] + result.stderr[-2000:])
    return result


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
        for command in ['shutdown', 'delete']:
            try:
                sim(command, device, check=False)
            except RuntimeError as error:
                print('Simulator cleanup: ' + str(error), flush=True)


if __name__ == '__main__':
    main()
