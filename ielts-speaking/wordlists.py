"""フィラー辞書とストップワード。後から自由に足してよい。

- FILLERS: 確実にフィラーとして数えるもの(複数語もOK)
- FILLERS_TO_CHECK: 普通の用法もあるので「要確認」として分けて数えるもの
- FILLER_VARIANTS: 文字起こしの表記ゆれ → 代表形
- STOPWORDS: 繰り返し語の集計から除外する機能語
"""

FILLERS = [
    "um", "uh", "er", "ah", "hmm",
    "you know", "i mean", "kind of", "sort of",
    "actually", "basically",
]

FILLERS_TO_CHECK = ["maybe", "much", "like"]

FILLER_VARIANTS = {
    "umm": "um", "ummm": "um", "uhm": "um", "em": "um",
    "uhh": "uh", "uhhh": "uh",
    "erm": "er", "err": "er",
    "ahh": "ah",
    "hm": "hmm", "hmmm": "hmm", "mm": "hmm", "mmm": "hmm",
}

STOPWORDS = set("""
a an the and or but if so because as than then that this these those there here
i me my mine myself we us our ours ourselves you your yours yourself yourselves
he him his himself she her hers herself it its itself they them their theirs themselves
what which who whom whose when where why how
am is are was were be been being do does did doing done have has had having
will would shall should can could may might must
not no nor don't doesn't didn't isn't aren't wasn't weren't won't wouldn't can't cannot couldn't
shouldn't haven't hasn't hadn't
i'm i've i'd i'll you're you've you'd you'll he's she's it's we're we've we'd we'll
they're they've they'd they'll that's there's what's let's
to of in on at by for with about from into onto over under up down out off
through during before after above below between again further once
all any both each few more most other some such only own same too just also
s t yeah yes ok okay oh well
""".split())
