from __future__ import annotations

import re

VALID_CATEGORIES = {
    "blood_bags", "temporary", "alcohol", "medical", "drugs",
    "energy_drinks", "candy",
}

ALCOHOL_ITEMS = {
    "Bottle of Beer", "Bottle of Champagne", "Bottle of Saké",
    "Bottle of Tequila", "Bottle of Kandy Kane", "Bottle of Pumpkin Brew",
    "Bottle of Minty Mayhem", "Bottle of Christmas Cocktail",
    "Bottle of Wicked Witch", "Bottle of Mistletoe Madness",
    "Bottle of Stinky Swamp Punch", "Bottle of Green Stout",
    "Bottle of Moonshine", "Bottle of Christmas Spirit", "Glass of Beer",
}

TEMPORARY_ITEMS = {"Epinephrine", "Melatonin", "Tyrosine", "Serotonin"}

MEDICAL_ITEMS = {
    "First Aid Kit", "Small First Aid Kit", "Morphine",
    "Empty Blood Bag", "Ipecac Syrup",
}

DRUG_ITEMS = {
    "Cannabis", "Ecstasy", "Ketamine", "Love Juice", "LSD",
    "Opium", "PCP", "Shrooms", "Speed", "Vicodin", "Xanax",
}

ENERGY_DRINK_ITEMS = {
    "Can of Munster", "Can of Red Cow", "Can of Taurine Elite",
    "Bottle of Energy Drink", "Can of Santa Shooters",
    "Can of Rockstar Rudolph",
}

CANDY_ITEMS = {
    "Bag of Candy Kisses", "Bag of Tootsie Rolls", "Box of Bon Bons",
    "Box of Chocolate Bars", "Jawbreaker", "Lollipop",
    "Bag of Chocolate Kisses", "Box of Sweet Hearts",
    "Box of Extra Strong Mints", "Bag of Bon Bons",
}

_RE_PLAYER_ID = re.compile(r"XID=(\d+)")
_RE_PLAYER_NAME = re.compile(r">([^<]+)</a>")
_RE_DEPOSIT = re.compile(r"deposited (\d+)\s*x\s+(.+)$")


def parse_deposit_news(html: str) -> tuple[int, str, int, str] | None:
    m_pid = _RE_PLAYER_ID.search(html)
    m_name = _RE_PLAYER_NAME.search(html)
    m_dep = _RE_DEPOSIT.search(html)
    if not m_pid or not m_name or not m_dep:
        return None
    return (
        int(m_pid.group(1)),
        m_name.group(1).strip(),
        int(m_dep.group(1)),
        m_dep.group(2).strip(),
    )


def matches_category(item_name: str, category: str) -> bool:
    if category == "blood_bags":
        return "Blood Bag" in item_name and "Empty Blood Bag" not in item_name
    if category == "temporary":
        return item_name in TEMPORARY_ITEMS
    if category == "alcohol":
        return item_name in ALCOHOL_ITEMS
    if category == "medical":
        return item_name in MEDICAL_ITEMS
    if category == "drugs":
        return item_name in DRUG_ITEMS
    if category == "energy_drinks":
        return item_name in ENERGY_DRINK_ITEMS
    if category == "candy":
        return item_name in CANDY_ITEMS
    return False


def matches_any_category(item_name: str, categories: str) -> bool:
    return any(matches_category(item_name, c.strip()) for c in categories.split(","))


def matches_competition(item_name: str, category_csv: str | None, items_csv: str | None) -> bool:
    """Check if a deposit matches a competition's categories OR specific items."""
    if category_csv:
        if matches_any_category(item_name, category_csv):
            return True
    if items_csv:
        if item_name in {i.strip() for i in items_csv.split(",") if i.strip()}:
            return True
    return False


CATEGORY_TO_ITEMS: dict[str, list[str]] = {
    "blood_bags": [
        "Blood Bag : A+", "Blood Bag : A-", "Blood Bag : B+", "Blood Bag : B-",
        "Blood Bag : AB+", "Blood Bag : AB-", "Blood Bag : O+", "Blood Bag : O-",
        "Blood Bag : Irradiated",
    ],
    "temporary": sorted(TEMPORARY_ITEMS),
    "alcohol": sorted(ALCOHOL_ITEMS),
    "medical": sorted(MEDICAL_ITEMS),
    "drugs": sorted(DRUG_ITEMS),
    "energy_drinks": sorted(ENERGY_DRINK_ITEMS),
    "candy": sorted(CANDY_ITEMS),
}
