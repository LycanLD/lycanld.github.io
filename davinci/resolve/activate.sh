#!/bin/bash
# Lumi's DaVinci Resolve Studio Linux activation script
# Run as regular user (uses sudo for priv actions)

set -e

RESOLVE_DIR="/opt/resolve"

BANNER='
.___                      _____        .____     ________   
|    |    ___.__. ____   /  |  |  ____ |    |    \______ \  
|    |   <   |  |/ ___\ /   |  |_/    \|    |     |    |  \ 
|    |___ \___  \  \___/    ^   /   |  \    |___  |    `   \
|_______ \/ ____|\___  >____   ||___|  /_______ \/_______  /
        \/\/         \/     |__|     \/        \/        \/'

write_license() {
  sudo mkdir -p "$RESOLVE_DIR/.license"
  echo -e "LICENSE blackmagic davinciresolvestudio 999999 permanent uncounted\n  hostid=ANY issuer=CGP customer=CGP issued=28-dec-2023\n  akey=0000-0000-0000-0000 _ck=00 sig=\"00\"" | sudo tee "$RESOLVE_DIR/.license/blackmagic.lic" > /dev/null
  sudo chmod 644 "$RESOLVE_DIR/.license/blackmagic.lic"
}

detect_version() {
  local ver=""

  if [[ -f "$RESOLVE_DIR/bin/resolve" ]]; then
    ver=$(strings "$RESOLVE_DIR/bin/resolve" 2>/dev/null | grep -oP 'DaVinci Resolve\s+\K[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
  fi

  if [[ -z "$ver" ]]; then
    ver=$(grep -roP 'DaVinci.Resolve.*?([0-9]+\.[0-9]+(\.[0-9]+)?)' "$RESOLVE_DIR/configs/" 2>/dev/null | grep -oP '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
  fi

  if [[ -z "$ver" && -f "$RESOLVE_DIR/configs/version.txt" ]]; then
    ver=$(cat "$RESOLVE_DIR/configs/version.txt" 2>/dev/null | grep -oP '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
  fi

  if [[ -z "$ver" ]]; then
    ver=$(pacman -Qi davinci-resolve 2>/dev/null | grep -oP 'Version\s*:\s*\K.*' | head -1)
  fi

  echo "$ver"
}

recommend_method() {
  local ver="$1"
  if [[ -z "$ver" ]]; then
    echo "none"
    return
  fi

  local major minor patch
  IFS='.' read -r major minor patch <<< "$ver"
  minor=${minor:-0}
  patch=${patch:-0}

  if [[ "$major" -ge 21 ]]; then
    echo "1"
  elif [[ "$major" -eq 20 ]]; then
    if [[ "$minor" -eq 0 ]] || [[ "$minor" -eq 1 && "$patch" -le 1 ]]; then
      echo "3"
    elif [[ "$minor" -eq 1 && "$patch" -ge 1 ]] || [[ "$minor" -eq 2 ]] || [[ "$minor" -eq 3 && "$patch" -le 1 ]]; then
      echo "2"
    else
      echo "2"
    fi
  else
    echo "none"
  fi
}

patch_v21() {
  echo "[*] Patching for DaVinci Resolve 21.0 - 21.0.2+..."

  sudo perl -pi -e 's/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\x74\x11\x48\x8B\x45\xC8\x8B/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\xEB\x11\x48\x8B\x45\xC8\x8B/g' "$RESOLVE_DIR/bin/resolve"

  sudo perl -pi -e 's/\x74\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/\xEB\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/g' "$RESOLVE_DIR/bin/resolve"

  sudo perl -0777 -pi -e 's/\x74(.\xBF\x16\x00\x00\x00\xBE.\x01\x00\x00\xE8..\x05)/\x75$1/g' "$RESOLVE_DIR/bin/resolve"
}

patch_v20_2to20_3() {
  echo "[*] Patching for DaVinci Resolve 20.0 - 20.1.1 / 20.2 / 20.3.1..."

  sudo perl -pi -e 's/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\x74\x11\x48\x8B\x45\xC8\x8B/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\xEB\x11\x48\x8B\x45\xC8\x8B/' "$RESOLVE_DIR/bin/resolve"

  sudo perl -pi -e 's/\x74\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/\xEB\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/' "$RESOLVE_DIR/bin/resolve"

  sudo perl -pi -e 's/\x41\xb6\x01\x84\xc0\x0f\x84\xb0\x00\x00\x00\x48\x85\xdb\x74\x08\x45\x31\xf6\xe9\xa3\x00\x00\x00/\x41\xb6\x00\x84\xc0\x0f\x84\xb0\x00\x00\x00\x48\x85\xdb\x74\x08\x45\x31\xf6\xe9\xa3\x00\x00\x00/' "$RESOLVE_DIR/bin/resolve"
}

patch_v20_1() {
  echo "[*] Patching for DaVinci Resolve 20.0 - 20.1 (NOT 20.1.1+)..."

  sudo /usr/bin/perl -pi -e 's/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\x74\x11\x48\x8B\x45\xC8\x8B/\x03\x00\x89\x45\xFC\x83\x7D\xFC\x00\xEB\x11\x48\x8B\x45\xC8\x8B/g' "$RESOLVE_DIR/bin/resolve"

  sudo /usr/bin/perl -pi -e 's/\x74\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/\xEB\x11\x48\x8B\x45\xC8\x8B\x55\xFC\x89\x50\x58\xB8\x00\x00\x00/g' "$RESOLVE_DIR/bin/resolve"

  sudo /usr/bin/perl -pi -e 's/\x74\x11\xE8\x31\x25\x00\x00\x48\x89\xC7\xE8\x09\xBA\x02\x00\x84/\x75\x11\xE8\x31\x25\x00\x00\x48\x89\xC7\xE8\x09\xBA\x02\x00\x84/g' "$RESOLVE_DIR/bin/resolve"
}


if [[ ! -d "$RESOLVE_DIR" ]]; then
  echo "Error: $RESOLVE_DIR not found. Is DaVinci Resolve installed?"
  exit 1
fi

if [[ $EUID -eq 0 ]]; then
  echo "Nice try, but no. Don't run this as root. It knows what it's doing."
  exit 1
fi


DETECTED_VER=$(detect_version)
RECOMMEND=$(recommend_method "$DETECTED_VER")

echo "$BANNER"
echo ""
echo "  = Lyc4n's DaVinci Resolve Studio Linux \"Activator\" ="
echo ""
echo "  Only use if you have a proper copy of the software."
echo "  ...or else ;3 (I won't judge you)"
echo ""
echo "  NOT related with Blackmagic Design."
echo "  Use at your own risk. No guarantees. No refunds. (It free anyways)"
echo "  If this breaks your system or doesn't work, that's a you problem, lol."
echo "  Made by Lyc4nLD, with love and a sht ton of coffee >w<"
echo ""
echo "  ================================"

if [[ -n "$DETECTED_VER" ]]; then
  echo ""
  echo "  Detected version: $DETECTED_VER"
else
  echo ""
  echo "  Detected version: couldn't figure it out :/"
fi

echo ""
echo "  Select your method:"

if [[ "$RECOMMEND" == "1" ]]; then
  echo ""
  echo "    [1]  21.0  -  21.0.2+                         <-- recommended"
  echo "    [2]  20.0  -  20.1.1 / 20.2 / 20.3.1"
  echo "    [3]  20.0  -  20.1  (NOT 20.1.1 and beyond)"
elif [[ "$RECOMMEND" == "2" ]]; then
  echo ""
  echo "    [1]  21.0  -  21.0.2+"
  echo "    [2]  20.0  -  20.1.1 / 20.2 / 20.3.1         <-- recommended"
  echo "    [3]  20.0  -  20.1  (NOT 20.1.1 and beyond)"
elif [[ "$RECOMMEND" == "3" ]]; then
  echo ""
  echo "    [1]  21.0  -  21.0.2+"
  echo "    [2]  20.0  -  20.1.1 / 20.2 / 20.3.1"
  echo "    [3]  20.0  -  20.1  (NOT 20.1.1 and beyond)   <-- recommended"
else
  echo ""
  echo "    [1]  21.0  -  21.0.2+"
  echo "    [2]  20.0  -  20.1.1 / 20.2 / 20.3.1"
  echo "    [3]  20.0  -  20.1  (NOT 20.1.1 and beyond)"
fi

echo "    [q]  Quit and use the free version instead"
echo ""
read -rp "  Choice: " choice

case "$choice" in
  1) patch_v21 ;;
  2) patch_v20_2to20_3 ;;
  3) patch_v20_1 ;;
  q|Q) echo "Coward. Fine, bye."; exit 0 ;;
  *) echo "That's not even an option. Try again."; exit 1 ;;
esac

echo ""
echo "[*] Writing license file..."
write_license

echo ""
echo "[*] All done. Go make something beautiful (or cursed)."
echo "[*] Launch with: davinci-resolve"
