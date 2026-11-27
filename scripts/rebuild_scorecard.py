#!/usr/bin/env python3
"""Prepare validated Scorecard data offline, then load into *_v2 staging tables.

--prepare never connects to MySQL. --load consumes only validated prepared files.
Production tables are never dropped or renamed.

DB connection env vars (for --load only):
  DB_HOST, DB_PORT (default 3306), DB_USER, DB_PASSWORD, DB_NAME
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import datetime
import math
import os
import sys
from pathlib import Path
from typing import Callable, Iterable, Optional

MISSING = {"", "PS", "NA", "NULL", "PRIVACYSUPPRESSED"}

INST_FIELDS = [
    "UNITID", "INSTNM", "CITY", "STABBR", "CONTROL", "UGDS", "STUFACR",
    "ADM_RATE_SUPP", "SAT_AVG", "SATVR25", "SATVR50", "SATVR75",
    "SATMT25", "SATMT50", "SATMT75", "ACTCM25", "ACTCM50", "ACTCM75",
    "OMAWDP8_ALL_POOLED_SUPP", "NPT4_PUB", "NPT4_PRIV", "MD_EARN_WNE_4YR",
    "GRAD_DEBT_MDN_SUPP", "PREDDEG", "CURROPER", "LOCALE", "RET_FT4",
    "NPT41_PUB", "NPT41_PRIV", "NPT42_PUB", "NPT42_PRIV",
    "NPT43_PUB", "NPT43_PRIV", "NPT44_PUB", "NPT44_PRIV",
    "NPT45_PUB", "NPT45_PRIV", "RPY_3YR_RT",
]

FOS_FIELDS = [
    "UNITID", "MAIN", "CIPCODE", "CIPDESC", "CREDLEV",
    "DEBT_ALL_STGP_EVAL_MDN", "DEBT_ALL_STGP_ANY_MDN",
    "DEBT_ALL_PP_EVAL_MDN", "DEBT_ALL_PP_ANY_MDN",
    "DEBT_ALL_STGP_EVAL_MDN10YRPAY", "EARN_MDN_4YR", "EARN_COUNT_WNE_4YR",
    "IPEDSCOUNT2", "EARN_MDN_4YR_NAT",
]


def clean(value: object) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return None if s.upper() in MISSING else s


def integer(value: object) -> Optional[int]:
    s = clean(value)
    if s is None:
        return None
    # Scorecard numeric CSV fields sometimes serialize integer-valued data as decimals.
    n = float(s)
    if not math.isfinite(n) or not n.is_integer():
        raise ValueError(f"Expected integer-valued number, got {value!r}")
    return int(n)


def decimal(value: object) -> Optional[float]:
    s = clean(value)
    if s is None:
        return None
    n = float(s)
    if not math.isfinite(n):
        raise ValueError(f"Expected finite number, got {value!r}")
    return n


def cip(value: object) -> Optional[str]:
    s = clean(value)
    if s is None:
        return None
    # CIPCODE is conceptually XX.XX; DB stores four digits, e.g. 11.07 -> 1107.
    return s.replace(".", "").zfill(4)


def pick_public_private(row: dict[str, str], stem: str) -> Optional[int]:
    public = integer(row[f"{stem}_PUB"])
    private = integer(row[f"{stem}_PRIV"])
    return public if public is not None else private


def read_csv(path: Path, required: Iterable[str]):
    f = path.open("r", encoding="utf-8-sig", newline="")
    reader = csv.DictReader(f)
    missing = set(required) - set(reader.fieldnames or [])
    if missing:
        f.close()
        raise RuntimeError(f"{path.name} is missing columns: {sorted(missing)}")
    return f, reader


def load_institutions(path: Path) -> list[tuple]:
    rows: list[tuple] = []
    f, reader = read_csv(path, INST_FIELDS)
    try:
        for r in reader:
            if clean(r["PREDDEG"]) != "3" or clean(r["CURROPER"]) != "1":
                continue
            rows.append((
                integer(r["UNITID"]), clean(r["INSTNM"]), clean(r["CITY"]), clean(r["STABBR"]),
                integer(r["CONTROL"]), integer(r["UGDS"]), integer(r["STUFACR"]), decimal(r["ADM_RATE_SUPP"]),
                integer(r["SAT_AVG"]), integer(r["SATVR25"]), integer(r["SATVR50"]), integer(r["SATVR75"]),
                integer(r["SATMT25"]), integer(r["SATMT50"]), integer(r["SATMT75"]), integer(r["ACTCM25"]),
                integer(r["ACTCM50"]), integer(r["ACTCM75"]), decimal(r["OMAWDP8_ALL_POOLED_SUPP"]),
                pick_public_private(r, "NPT4"), integer(r["MD_EARN_WNE_4YR"]), integer(r["GRAD_DEBT_MDN_SUPP"]),
                integer(r["LOCALE"]), decimal(r["RET_FT4"]), pick_public_private(r, "NPT41"),
                pick_public_private(r, "NPT42"), pick_public_private(r, "NPT43"), pick_public_private(r, "NPT44"),
                pick_public_private(r, "NPT45"), decimal(r["RPY_3YR_RT"]),
            ))
    finally:
        f.close()
    return rows


def load_fos(path: Path) -> tuple[list[tuple], list[tuple]]:
    bachelors: list[tuple] = []
    majors_by_cip: dict[str, str] = {}
    f, reader = read_csv(path, FOS_FIELDS)
    try:
        for r in reader:
            code = cip(r["CIPCODE"])
            desc = clean(r["CIPDESC"])
            if code and desc and code not in majors_by_cip:
                majors_by_cip[code] = desc.rstrip(".").strip()

            if clean(r["CREDLEV"]) != "3" or clean(r["UNITID"]) is None or code is None:
                continue
            bachelors.append((
                integer(r["UNITID"]), integer(r["MAIN"]), code,
                integer(r["DEBT_ALL_STGP_EVAL_MDN"]), integer(r["DEBT_ALL_STGP_ANY_MDN"]),
                integer(r["DEBT_ALL_PP_EVAL_MDN"]), integer(r["DEBT_ALL_PP_ANY_MDN"]),
                integer(r["DEBT_ALL_STGP_EVAL_MDN10YRPAY"]), integer(r["EARN_MDN_4YR"]),
                integer(r["EARN_COUNT_WNE_4YR"]), integer(r["IPEDSCOUNT2"]), integer(r["EARN_MDN_4YR_NAT"]),
            ))
    finally:
        f.close()
    majors = sorted(majors_by_cip.items())
    return bachelors, majors


def assert_range(name: str, vals: Iterable[Optional[float]], lo: float, hi: float) -> None:
    bad = [x for x in vals if x is not None and not (lo <= x <= hi)]
    if bad:
        raise AssertionError(f"{name}: {len(bad)} values outside [{lo}, {hi}], e.g. {bad[:5]}")


def validate(inst: list[tuple], fos: list[tuple], majors: list[tuple]) -> None:
    if len(inst) != 1944:
        raise AssertionError(f"Expected 1,944 institutions for this release, got {len(inst):,}")
    if len({r[0] for r in inst}) != len(inst):
        raise AssertionError("Duplicate institution UNITID")
    if len(fos) != 69948:
        raise AssertionError(f"Expected 69,948 bachelor FOS rows for this release, got {len(fos):,}")
    if len({(r[0], r[2]) for r in fos}) != len(fos):
        raise AssertionError("Duplicate (UNITID, CIP) in bachelor FOS data")
    if len(majors) != 429:
        raise AssertionError(f"Expected 429 distinct CIP majors for this release, got {len(majors):,}")

    # Institution tuple indices: adm=7, grad=18, retention=23, repayment=29.
    assert_range("adm_rate", (r[7] for r in inst), 0, 1)
    assert_range("grad_rate", (r[18] for r in inst), 0, 1)
    assert_range("retention_rate", (r[23] for r in inst), 0, 1)
    assert_range("repay_3yr", (r[29] for r in inst), 0, 1)

    # The historical bug converted suppressed FOS numeric values to zero.
    # These monetary/count fields should not contain artificial zeroes in this release.
    # Zero is legitimate for IPEDSCOUNT2 (a program can report zero completions),
    # but should not appear in the historical debt/earnings fields after suppression parsing.
    zero_forbidden_indices = (3, 4, 5, 6, 7, 8, 9, 11)
    if any(r[i] == 0 for r in fos for i in zero_forbidden_indices if r[i] is not None):
        raise AssertionError("Unexpected zero in FOS debt/earnings fields; inspect suppression parsing")

    print("Validation passed")
    print(f"  institutions_v2: {len(inst):,}")
    print(f"  fos_bachelors_v2: {len(fos):,}")
    print(f"  majors_v2: {len(majors):,}")
    print(f"  FOS rows with 4yr earnings: {sum(r[8] is not None for r in fos):,}")
    print(f"  FOS rows with major completions: {sum(r[10] is not None for r in fos):,}")
    print(f"  FOS rows with national 4yr earnings: {sum(r[11] is not None for r in fos):,}")


def chunks(rows: list[tuple], size: int = 1000):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


DDL = """
CREATE TABLE institutions_v2 (
  unitid INT UNSIGNED NOT NULL,
  instnm VARCHAR(255) NOT NULL,
  short_name VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  stabbr CHAR(2) NOT NULL,
  control TINYINT UNSIGNED NOT NULL,
  ugds MEDIUMINT UNSIGNED DEFAULT NULL,
  stufacr SMALLINT UNSIGNED DEFAULT NULL,
  adm_rate DECIMAL(5,4) DEFAULT NULL,
  sat_avg SMALLINT UNSIGNED DEFAULT NULL,
  satvr25 SMALLINT UNSIGNED DEFAULT NULL,
  satvr50 SMALLINT UNSIGNED DEFAULT NULL,
  satvr75 SMALLINT UNSIGNED DEFAULT NULL,
  satmt25 SMALLINT UNSIGNED DEFAULT NULL,
  satmt50 SMALLINT UNSIGNED DEFAULT NULL,
  satmt75 SMALLINT UNSIGNED DEFAULT NULL,
  actcm25 TINYINT UNSIGNED DEFAULT NULL,
  actcm50 TINYINT UNSIGNED DEFAULT NULL,
  actcm75 TINYINT UNSIGNED DEFAULT NULL,
  grad_rate DECIMAL(5,4) DEFAULT NULL,
  npt4 INT DEFAULT NULL,
  md_earn_4yr INT UNSIGNED DEFAULT NULL,
  grad_debt_mdn INT UNSIGNED DEFAULT NULL,
  locale TINYINT UNSIGNED DEFAULT NULL,
  retention_rate DECIMAL(5,4) DEFAULT NULL,
  npt4_0_30 INT DEFAULT NULL,
  npt4_30_48 INT DEFAULT NULL,
  npt4_48_75 INT DEFAULT NULL,
  npt4_75_110 INT DEFAULT NULL,
  npt4_110_plus INT DEFAULT NULL,
  repay_3yr DECIMAL(5,4) DEFAULT NULL,
  PRIMARY KEY (unitid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE majors_v2 (
  cip_code CHAR(4) NOT NULL,
  cip_desc VARCHAR(255) NOT NULL,
  PRIMARY KEY (cip_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fos_bachelors_v2 (
  unitid INT UNSIGNED NOT NULL,
  main TINYINT(1) NOT NULL,
  cip_code CHAR(4) NOT NULL,
  debt_all_stgp_eval_mdn INT UNSIGNED DEFAULT NULL,
  debt_all_stgp_any_mdn INT UNSIGNED DEFAULT NULL,
  debt_all_pp_eval_mdn INT UNSIGNED DEFAULT NULL,
  debt_all_pp_any_mdn INT UNSIGNED DEFAULT NULL,
  debt_all_stgp_eval_mdn10yrpay INT UNSIGNED DEFAULT NULL,
  earn_mdn_4yr INT UNSIGNED DEFAULT NULL,
  earn_count_wne_4yr MEDIUMINT UNSIGNED DEFAULT NULL,
  major_completions SMALLINT UNSIGNED DEFAULT NULL,
  earn_mdn_4yr_nat INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (unitid, cip_code),
  KEY idx_major_pay (cip_code, earn_mdn_4yr DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""

INST_INSERT = """INSERT INTO institutions_v2
(unitid, instnm, city, stabbr, control, ugds, stufacr, adm_rate, sat_avg,
 satvr25, satvr50, satvr75, satmt25, satmt50, satmt75, actcm25, actcm50,
 actcm75, grad_rate, npt4, md_earn_4yr, grad_debt_mdn, locale, retention_rate,
 npt4_0_30, npt4_30_48, npt4_48_75, npt4_75_110, npt4_110_plus, repay_3yr)
VALUES (""" + ",".join(["%s"] * 30) + ")"

FOS_INSERT = """INSERT INTO fos_bachelors_v2
(unitid, main, cip_code, debt_all_stgp_eval_mdn, debt_all_stgp_any_mdn,
 debt_all_pp_eval_mdn, debt_all_pp_any_mdn, debt_all_stgp_eval_mdn10yrpay,
 earn_mdn_4yr, earn_count_wne_4yr, major_completions, earn_mdn_4yr_nat)
VALUES (""" + ",".join(["%s"] * 12) + ")"

MAJOR_INSERT = "INSERT INTO majors_v2 (cip_code, cip_desc) VALUES (%s,%s)"


def connect_db():
    try:
        import pymysql
    except ImportError as e:
        raise RuntimeError("Install PyMySQL first: python -m pip install PyMySQL") from e
    required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    absent = [x for x in required if not os.getenv(x)]
    if absent:
        raise RuntimeError(f"Missing DB environment variables: {', '.join(absent)}")
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"], charset="utf8mb4", autocommit=False,
    )


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare(inst_path: Path, fos_path: Path, output: Path) -> None:
    if output.exists() and any(output.iterdir()):
        raise RuntimeError(f"Output directory is not empty: {output}. Choose a new directory.")
    inst = load_institutions(inst_path)
    fos, majors = load_fos(fos_path)
    validate(inst, fos, majors)
    output.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, rows in (("institutions", inst), ("fos_bachelors", fos), ("majors", majors)):
        path = output / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n")
        files[name] = {"filename": path.name, "rows": len(rows), "sha256": file_hash(path)}
    manifest = {
        "format_version": 1,
        "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sources": {"institution": inst_path.name, "fos": fos_path.name},
        "files": files,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared validated files in {output}; no database connection was made.")


def read_prepared(folder: Path) -> tuple[list[tuple], list[tuple], list[tuple]]:
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format_version") != 1:
        raise RuntimeError("Unknown prepared-data format version")
    result = {}
    for name in ("institutions", "fos_bachelors", "majors"):
        entry = manifest["files"][name]
        path = folder / entry["filename"]
        if path.name != f"{name}.jsonl" or file_hash(path) != entry["sha256"]:
            raise RuntimeError(f"Prepared {name} file changed since validation")
        with path.open(encoding="utf-8") as f:
            rows = [tuple(json.loads(line)) for line in f]
        if len(rows) != entry["rows"]:
            raise RuntimeError(f"Prepared {name} row count mismatch")
        result[name] = rows
    validate(result["institutions"], result["fos_bachelors"], result["majors"])
    return result["institutions"], result["fos_bachelors"], result["majors"]


def load_db(inst: list[tuple], fos: list[tuple], majors: list[tuple], replace_staging: bool) -> None:
    conn = connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DATABASE()")
            db_name = cur.fetchone()[0]
            if db_name != os.environ["DB_NAME"]:
                raise RuntimeError("Connected to an unexpected database")
            staging = ("institutions_v2", "fos_bachelors_v2", "majors_v2")
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (%s,%s,%s)", staging)
            existing = {row[0] for row in cur.fetchall()}
            if existing and not replace_staging:
                raise RuntimeError(f"Staging tables already exist: {sorted(existing)}. Refusing to overwrite. Use --replace-staging explicitly if intended.")
            if existing and replace_staging:
                # Explicitly limited to staging table names, never production.
                for table in ("fos_bachelors_v2", "majors_v2", "institutions_v2"):
                    cur.execute(f"DROP TABLE IF EXISTS `{table}`")
            for statement in DDL.split(";"):
                if statement.strip():
                    cur.execute(statement)
            for batch in chunks(inst):
                cur.executemany(INST_INSERT, batch)
            for batch in chunks(majors):
                cur.executemany(MAJOR_INSERT, batch)
            for batch in chunks(fos):
                cur.executemany(FOS_INSERT, batch)
            # Preserve curated nicknames from production; no production writes.
            cur.execute("""
                UPDATE institutions_v2 v
                JOIN institutions old ON old.unitid = v.unitid
                SET v.short_name = old.short_name
            """)
            for table, expected in (("institutions_v2", len(inst)), ("fos_bachelors_v2", len(fos)), ("majors_v2", len(majors))):
                cur.execute(f"SELECT COUNT(*) FROM `{table}`")
                actual = cur.fetchone()[0]
                if actual != expected:
                    raise RuntimeError(f"{table}: expected {expected} rows, got {actual}")
        conn.commit()
    except Exception:
        conn.rollback()
        # MySQL DDL commits implicitly: if loading fails, staging tables may remain.
        raise
    finally:
        conn.close()
    print("Staging tables populated and row counts verified. Production tables unchanged.")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument("--prepare", action="store_true", help="Clean, validate and write prepared files; never access MySQL")
    modes.add_argument("--load", action="store_true", help="Verify prepared files and populate staging tables")
    p.add_argument("--institution", type=Path, help="Raw institution CSV (prepare only)")
    p.add_argument("--fos", type=Path, help="Raw field-of-study CSV (prepare only)")
    p.add_argument("--output", type=Path, default=Path("data/scorecard-prepared-v2"), help="Prepared data directory")
    p.add_argument("--replace-staging", action="store_true", help="Allow dropping and recreating existing *_v2 staging tables (load only)")
    args = p.parse_args()
    if args.prepare:
        if not args.institution or not args.fos or args.replace_staging:
            p.error("--prepare requires --institution and --fos; cannot use --replace-staging")
        prepare(args.institution, args.fos, args.output)
    else:
        if args.institution or args.fos:
            p.error("--load reads --output; do not supply raw CSV paths")
        inst, fos, majors = read_prepared(args.output)
        load_db(inst, fos, majors, args.replace_staging)
    return 0


if __name__ == "__main__":
    sys.exit(main())
