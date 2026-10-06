/**
 * Outputs recorded from an Identity Security Cloud tenant (identity preview, 2026-10-06).
 * Every case runs against an identity whose middleName is null.
 */
export interface TenantCase {
  label: string;
  transform: unknown;
  expected: { ok: true; value: string | null } | { ok: false; tenantError: string };
}

export const TENANT_CASES: TenantCase[] = [
  {
    "label": "concat with null",
    "transform": {
      "type": "concat",
      "attributes": {
        "values": [
          "a",
          {
            "type": "identityAttribute",
            "attributes": {
              "name": "middleName"
            }
          },
          "b"
        ]
      }
    },
    "expected": {
      "ok": true,
      "value": "ab"
    }
  },
  {
    "label": "join with null",
    "transform": {
      "type": "join",
      "attributes": {
        "values": [
          "a",
          {
            "type": "identityAttribute",
            "attributes": {
              "name": "middleName"
            }
          },
          "b"
        ],
        "separator": "-"
      }
    },
    "expected": {
      "ok": true,
      "value": "a-null-b"
    }
  },
  {
    "label": "velocity empty string in #if",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#set($e = \"\")#if($e)T#{else}F#end"
      }
    },
    "expected": {
      "ok": true,
      "value": "T"
    }
  },
  {
    "label": "velocity multi-line",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#if(true)\nA\n#end\nB\n#set($x = 1)\nC"
      }
    },
    "expected": {
      "ok": true,
      "value": "A\nB\nC"
    }
  },
  {
    "label": "velocity \"1\" == 1",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#if(\"1\" == 1)T#{else}F#end"
      }
    },
    "expected": {
      "ok": true,
      "value": "T"
    }
  },
  {
    "label": "velocity arithmetic",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#set($n = 2 + 3)$n"
      }
    },
    "expected": {
      "ok": true,
      "value": "5"
    }
  },
  {
    "label": "velocity interpolation",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#set($n = \"Ada\")#set($m = \"Hi $n\")$m"
      }
    },
    "expected": {
      "ok": true,
      "value": "Hi Ada"
    }
  },
  {
    "label": "velocity undefined ref",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "x$nope y"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: x$nope y"
    }
  },
  {
    "label": "velocity null result",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#set($x = null)$x"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: #set($x = null)$x"
    }
  },
  {
    "label": "velocity foreach",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#foreach($i in [1..3])$i#end"
      }
    },
    "expected": {
      "ok": true,
      "value": "123"
    }
  },
  {
    "label": "velocity string methods",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "$a.substring(0, 3).toUpperCase()|$a.replaceAll(\"[aeiou]\", \"_\")|$a.split(\",\").size()",
        "a": "banana,x"
      }
    },
    "expected": {
      "ok": true,
      "value": "BAN|b_n_n_,x|2"
    }
  },
  {
    "label": "substring out of range",
    "transform": {
      "type": "substring",
      "attributes": {
        "input": "abc",
        "begin": 1,
        "end": 10
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "begin 1, end 10, length 3"
    }
  },
  {
    "label": "substring offsets",
    "transform": {
      "type": "substring",
      "attributes": {
        "input": "abcdef",
        "begin": 1,
        "beginOffset": 1,
        "end": 4
      }
    },
    "expected": {
      "ok": true,
      "value": "cd"
    }
  },
  {
    "label": "split trailing empty",
    "transform": {
      "type": "split",
      "attributes": {
        "input": "a,b,,",
        "delimiter": ",",
        "index": 3
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Split resulted in 2 items and you attempted to index at 3"
    }
  },
  {
    "label": "replace regex",
    "transform": {
      "type": "replace",
      "attributes": {
        "input": "a.b.c",
        "regex": "\\.",
        "replacement": "-"
      }
    },
    "expected": {
      "ok": true,
      "value": "a-b-c"
    }
  },
  {
    "label": "replace groups",
    "transform": {
      "type": "replace",
      "attributes": {
        "input": "John Smith",
        "regex": "(\\w+) (\\w+)",
        "replacement": "$2 $1"
      }
    },
    "expected": {
      "ok": true,
      "value": "Smith John"
    }
  },
  {
    "label": "replaceAll table",
    "transform": {
      "type": "replaceAll",
      "attributes": {
        "input": "a-b_c",
        "table": {
          "-": " ",
          "_": "."
        }
      }
    },
    "expected": {
      "ok": true,
      "value": "a b.c"
    }
  },
  {
    "label": "dateFormat zone",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00Z",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd HH:mm z"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat epoch",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "1700000000000",
        "inputFormat": "EPOCH_TIME_JAVA",
        "outputFormat": "ISO8601"
      }
    },
    "expected": {
      "ok": true,
      "value": "2023-11-14T22:13:20.000Z"
    }
  },
  {
    "label": "dateFormat pattern in",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "03/29/2026",
        "inputFormat": "MM/dd/yyyy",
        "outputFormat": "ISO8601"
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-03-29T00:00:00.000Z"
    }
  },
  {
    "label": "dateMath month end",
    "transform": {
      "type": "dateMath",
      "attributes": {
        "input": "2026-01-31T00:00:00Z",
        "expression": "+1M"
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-02-28T00:00Z"
    }
  },
  {
    "label": "dateMath round",
    "transform": {
      "type": "dateMath",
      "attributes": {
        "input": "2026-01-31T15:20:00Z",
        "expression": "+1d/d",
        "roundUp": true
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-02-02T00:00Z"
    }
  },
  {
    "label": "dateCompare now",
    "transform": {
      "type": "dateCompare",
      "attributes": {
        "firstDate": "2026-01-01T00:00:00Z",
        "secondDate": "now",
        "operator": "LT",
        "positiveCondition": "yes",
        "negativeCondition": "no"
      }
    },
    "expected": {
      "ok": true,
      "value": "yes"
    }
  },
  {
    "label": "conditional",
    "transform": {
      "type": "conditional",
      "attributes": {
        "expression": "$a eq ABC",
        "a": "ABC",
        "positiveCondition": "yes",
        "negativeCondition": "no"
      }
    },
    "expected": {
      "ok": true,
      "value": "yes"
    }
  },
  {
    "label": "e164phone FR",
    "transform": {
      "type": "e164phone",
      "attributes": {
        "input": "06 12 34 56 78",
        "defaultRegion": "FR"
      }
    },
    "expected": {
      "ok": true,
      "value": "+33612345678"
    }
  },
  {
    "label": "iso3166",
    "transform": {
      "type": "iso3166",
      "attributes": {
        "input": "France"
      }
    },
    "expected": {
      "ok": true,
      "value": "FR"
    }
  },
  {
    "label": "normalizeNames",
    "transform": {
      "type": "normalizeNames",
      "attributes": {
        "input": "JEAN-PIERRE o'neil mcdonald III"
      }
    },
    "expected": {
      "ok": true,
      "value": "Jean-Pierre O'Neil McDonald III"
    }
  },
  {
    "label": "decomposeDiacriticalMarks",
    "transform": {
      "type": "decomposeDiacriticalMarks",
      "attributes": {
        "input": "Élodie Ñúñez"
      }
    },
    "expected": {
      "ok": true,
      "value": "Elodie Nunez"
    }
  },
  {
    "label": "leftPad",
    "transform": {
      "type": "leftPad",
      "attributes": {
        "input": "7",
        "length": 3,
        "padding": "0"
      }
    },
    "expected": {
      "ok": true,
      "value": "007"
    }
  },
  {
    "label": "lookup no match",
    "transform": {
      "type": "lookup",
      "attributes": {
        "input": "XX",
        "table": {
          "US": "United States"
        }
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Lookup table has no entry for input: XX and no default is specified"
    }
  },
  {
    "label": "firstValid all null",
    "transform": {
      "type": "firstValid",
      "attributes": {
        "values": [
          {
            "type": "identityAttribute",
            "attributes": {
              "name": "middleName"
            }
          },
          {
            "type": "identityAttribute",
            "attributes": {
              "name": "middleName"
            }
          }
        ]
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "base64Encode accent",
    "transform": {
      "type": "base64Encode",
      "attributes": {
        "input": "é"
      }
    },
    "expected": {
      "ok": true,
      "value": "w6k="
    }
  },
  {
    "label": "lower of null",
    "transform": {
      "type": "lower",
      "attributes": {
        "input": {
          "type": "identityAttribute",
          "attributes": {
            "name": "middleName"
          }
        }
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "replace forceNull, matching",
    "transform": {
      "type": "replace",
      "attributes": {
        "input": "NULL_VALUE",
        "regex": "NULL_VALUE",
        "replacement": "#set($forceNull = null)$forceNull"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: #set($forceNull = null)$forceNull"
    }
  },
  {
    "label": "replace forceNull, not matching",
    "transform": {
      "type": "replace",
      "attributes": {
        "input": "O365-S",
        "regex": "NULL_VALUE",
        "replacement": "#set($forceNull = null)$forceNull"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: #set($forceNull = null)$forceNull"
    }
  },
  {
    "label": "velocity quiet null",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "a$!x b",
        "x": {
          "type": "identityAttribute",
          "attributes": {
            "name": "middleName"
          }
        }
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: a$!x b"
    }
  },
  {
    "label": "velocity null variable",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "a$x b",
        "x": {
          "type": "identityAttribute",
          "attributes": {
            "name": "middleName"
          }
        }
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: a$x b"
    }
  },
  {
    "label": "dateFormat zone letter X",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00Z",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd HH:mm X"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat plain pattern out",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00Z",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd HH:mm"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateMath round down",
    "transform": {
      "type": "dateMath",
      "attributes": {
        "input": "2026-01-31T15:20:00Z",
        "expression": "/d"
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-01-31T00:00Z"
    }
  },
  {
    "label": "dateMath round up on boundary",
    "transform": {
      "type": "dateMath",
      "attributes": {
        "input": "2026-01-31T00:00:00Z",
        "expression": "/d",
        "roundUp": true
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-02-01T00:00Z"
    }
  },
  {
    "label": "split regex delimiter",
    "transform": {
      "type": "split",
      "attributes": {
        "input": "a1b22c",
        "delimiter": "\\d+",
        "index": 2
      }
    },
    "expected": {
      "ok": true,
      "value": "c"
    }
  },
  {
    "label": "dateFormat ISO millis in",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00.000Z",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd HH:mm"
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-03-29 01:30"
    }
  },
  {
    "label": "dateFormat ISO date only in",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat ISO offset in",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00+02:00",
        "inputFormat": "ISO8601",
        "outputFormat": "yyyy-MM-dd HH:mm"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat no formats",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "2026-03-29T01:30:00Z"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat bad input",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "notadate",
        "inputFormat": "MM/dd/yyyy",
        "outputFormat": "ISO8601"
      }
    },
    "expected": {
      "ok": true,
      "value": null
    }
  },
  {
    "label": "dateFormat pattern to pattern",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "03/29/2026",
        "inputFormat": "MM/dd/yyyy",
        "outputFormat": "dd.MM.yyyy"
      }
    },
    "expected": {
      "ok": true,
      "value": "29.03.2026"
    }
  },
  {
    "label": "dateFormat pattern to zone z",
    "transform": {
      "type": "dateFormat",
      "attributes": {
        "input": "03/29/2026",
        "inputFormat": "MM/dd/yyyy",
        "outputFormat": "yyyy-MM-dd HH:mm z"
      }
    },
    "expected": {
      "ok": true,
      "value": "2026-03-29 00:00 GMT"
    }
  },
  {
    "label": "velocity quiet undefined",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "a$!nope b"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: a$!nope b"
    }
  },
  {
    "label": "velocity quiet after set null",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "#set($x = null)a$!x b"
      }
    },
    "expected": {
      "ok": false,
      "tenantError": "Error rendering template: #set($x = null)a$!x b"
    }
  },
  {
    "label": "velocity quiet empty string",
    "transform": {
      "type": "static",
      "attributes": {
        "value": "a$!x b",
        "x": ""
      }
    },
    "expected": {
      "ok": true,
      "value": "a b"
    }
  }
];
