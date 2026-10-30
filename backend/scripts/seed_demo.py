"""Load the simulated demo players into the database.

    cd backend
    python -m scripts.seed_demo            # adds them if they are missing
    python -m scripts.seed_demo --reset    # deletes and rebuilds them (fresh dates)
"""

import argparse

from app import db
from app.demo import DEMO_PLAYERS, seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete and rebuild the demo players")
    args = parser.parse_args()
    db.init_db()
    stored = seed_demo(reset=args.reset)
    if not stored:
        print("Demo players already exist (use --reset to rebuild them).")
    for nickname, n in stored.items():
        print(f"{nickname}: {n} events")
    for p in DEMO_PLAYERS:
        print(f"  {p.nickname}  user_id={p.user_id}")


if __name__ == "__main__":
    main()
