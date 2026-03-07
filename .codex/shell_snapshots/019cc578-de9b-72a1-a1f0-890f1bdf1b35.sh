# Snapshot file
# Unset all aliases to avoid conflicts with functions
# Functions
gawklibpath_append () 
{ 
    [ -z "$AWKLIBPATH" ] && AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`;
    export AWKLIBPATH="$AWKLIBPATH:$*"
}
gawklibpath_default () 
{ 
    unset AWKLIBPATH;
    export AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`
}
gawklibpath_prepend () 
{ 
    [ -z "$AWKLIBPATH" ] && AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`;
    export AWKLIBPATH="$*:$AWKLIBPATH"
}
gawkpath_append () 
{ 
    [ -z "$AWKPATH" ] && AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`;
    export AWKPATH="$AWKPATH:$*"
}
gawkpath_default () 
{ 
    unset AWKPATH;
    export AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`
}
gawkpath_prepend () 
{ 
    [ -z "$AWKPATH" ] && AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`;
    export AWKPATH="$*:$AWKPATH"
}

# setopts 3
set -o braceexpand
set -o hashall
set -o interactive-comments

# aliases 0

# exports 39
declare -x CODEX_HOME="/home/figs/.openclaw/workspace/openclaw-fork/.codex"
declare -x CODEX_MANAGED_BY_NPM="1"
declare -x DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/1000/bus"
declare -x DEBUGINFOD_URLS="https://debuginfod.ubuntu.com "
declare -x GSM_SKIP_SSH_AGENT_WORKAROUND="true"
declare -x GTK_MODULES="gail:atk-bridge"
declare -x HOME="/home/figs"
declare -x INVOCATION_ID="6c6f53d898ab47049ad0baa61ae4c78f"
declare -x JOURNAL_STREAM="9:2917658"
declare -x LANG="en_US.utf8"
declare -x LOGNAME="figs"
declare -x MANAGERPID="3210"
declare -x MEMORY_PRESSURE_WATCH="/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/openclaw-gateway.service/memory.pressure"
declare -x MEMORY_PRESSURE_WRITE="c29tZSAyMDAwMDAgMjAwMDAwMAA="
declare -x NODE_NO_WARNINGS="1"
declare -x NO_COLOR="1"
declare -x OPENCLAW_GATEWAY_PORT="18789"
declare -x OPENCLAW_GATEWAY_TOKEN="49013067495a5d6e572ad6c6ac572655ca756a28a66c417d"
declare -x OPENCLAW_PATH_BOOTSTRAPPED="1"
declare -x OPENCLAW_SERVICE_KIND="gateway"
declare -x OPENCLAW_SERVICE_MARKER="openclaw"
declare -x OPENCLAW_SERVICE_VERSION="2026.2.21-2"
declare -x OPENCLAW_SHELL="exec"
declare -x OPENCLAW_SYSTEMD_UNIT="openclaw-gateway.service"
declare -x PATH="/home/figs/.local/bin:/usr/local/cuda/bin:/opt/bin/:/home/figs/.openclaw/workspace/openclaw-fork/.codex/tmp/arg0/codex-arg0AqrZFH:/home/figs/.nvm/versions/node/v25.6.1/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/path:/home/figs/.local/bin:/usr/local/cuda/bin:/opt/bin/:/home/figs/.nvm/versions/node/v25.6.1/bin:/usr/local/bin:/home/figs/.local/share/pnpm:/home/figs/.bun/bin:/usr/bin:/bin:/home/figs/.cargo/bin:/home/figs/.pyenv/bin:/home/figs/.nvm/current/bin:/home/figs/.npm-global/bin:/home/figs/bin:/home/figs/.volta/bin:/home/figs/.asdf/shims:/home/figs/.fnm/current/bin:/snap/bin"
declare -x QT_ACCESSIBILITY="1"
declare -x SHELL="/bin/sh"
declare -x SHLVL="3"
declare -x SSH_AUTH_SOCK="/run/user/1000/gnupg/S.gpg-agent.ssh"
declare -x STY="1266123.codex-consolidate"
declare -x SYSTEMD_EXEC_PID="793528"
declare -x TERM="screen"
declare -x TERMCAP="SC|screen|VT 100/ANSI X3.64 virtual terminal:DO=\\E[%dB:LE=\\E[%dD:RI=\\E[%dC:UP=\\E[%dA:bs:bt=\\E[Z:cd=\\E[J:ce=\\E[K:cl=\\E[H\\E[J:cm=\\E[%i%d;%dH:ct=\\E[3g:do=^J:nd=\\E[C:pt:rc=\\E8:rs=\\Ec:sc=\\E7:st=\\EH:up=\\EM:le=^H:bl=^G:cr=^M:it#8:ho=\\E[H:nw=\\EE:ta=^I:is=\\E)0:li#24:co#80:am:xn:xv:LP:sr=\\EM:al=\\E[L:AL=\\E[%dL:cs=\\E[%i%d;%dr:dl=\\E[M:DL=\\E[%dM:dc=\\E[P:DC=\\E[%dP:im=\\E[4h:ei=\\E[4l:mi:IC=\\E[%d@:ks=\\E[?1h\\E=:ke=\\E[?1l\\E>:vi=\\E[?25l:ve=\\E[34h\\E[?25h:vs=\\E[34l:ti=\\E[?1049h:te=\\E[?1049l:Km=\\E[M:k0=\\E[10~:k1=\\EOP:k2=\\EOQ:k3=\\EOR:k4=\\EOS:k5=\\E[15~:k6=\\E[17~:k7=\\E[18~:k8=\\E[19~:k9=\\E[20~:k;=\\E[21~:F1=\\E[23~:F2=\\E[24~:kh=\\E[1~:@1=\\E[1~:kH=\\E[4~:@7=\\E[4~:kN=\\E[6~:kP=\\E[5~:kI=\\E[2~:kD=\\E[3~:ku=\\EOA:kd=\\EOB:kr=\\EOC:kl=\\EOD:"
declare -x TMPDIR="/tmp"
declare -x USER="figs"
declare -x VIPSHOME="/target"
declare -x WINDOW="0"
declare -x XDG_DATA_DIRS="/usr/share/gnome:/usr/local/share/:/usr/share/:/var/lib/snapd/desktop"
declare -x XDG_RUNTIME_DIR="/run/user/1000"
