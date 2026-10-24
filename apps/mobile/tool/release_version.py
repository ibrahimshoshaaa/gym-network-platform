"""One Android version-code clock for GitHub Actions and Codemagic."""
import time

EPOCH_2026 = 1767225600
FLOOR = 1000000
MAX_BASE = 2100000000 - 4000  # Reserve Flutter's largest per-ABI offset.


def build_number(timestamp=None):
    seconds = int(time.time() if timestamp is None else timestamp)
    code = FLOOR + seconds - EPOCH_2026
    if not FLOOR <= code <= MAX_BASE:
        raise ValueError('Release clock is outside the supported Android version-code range')
    return code


if __name__ == '__main__':
    print(build_number())
