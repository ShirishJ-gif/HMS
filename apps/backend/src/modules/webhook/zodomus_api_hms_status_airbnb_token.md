| Step | Zodomus API | HMS status |
  |---|---|---|
  | 1 | Create property/rooms/rates in HMS | Already exists in HMS setup |
  | 2 | GET /channels | Done: Certification testing → Get channels |
  | 3 | GET /price-model | Partially done: used for Price model dropdown, but no manual response button yet |
  | 4 | POST /property-activation | Done: Provider IDs → Re-activate property |
  | 5 | GET /room-rates | Done: Provider IDs → Load Zodomus rooms & rates |
  | 6 | POST /property-check | Done: Certification testing → Check property |
  | 7 | POST /rooms-activation | Done: Provider IDs → Activate mapped rooms in Zodomus |
  | 8 | POST /property-check again | Done: Provider IDs → Run final property check |
  | 9 | POST /availability | Done: Certification testing → Post availability |
  | 10 | POST /rates | Done: Certification testing → Post rates |
  | 11 | GET /reservations-summary | Done: Certification testing → Reservation summary |
  | 12 | POST /reservations-createtest | Done: Admin tools → Provider reservation event → New |
  | 13 | GET /reservations-queue | Done: Certification testing → Reservation queue |
  | 14 | GET /reservations | Done: Certification testing → Get reservation |
  | 15 | GET /reservations-cc | Done: Certification testing → Get card data with ZODOMUS_CREDIT_CARD_API_PASSWORD |




  
  "status": {
    "returnCode": 400,
    "returnMessage": "host-activation-post Error: There is an Airbnb host already with an active process: Cancel the current host request to create a new one.",
    "channelLogId": "",
    "channelOtherMessages": "",
    "timestamp": "2026-05-22 11:34:04"
  },
  "token": 66611158390,
  "client_id": "9634cBTrdfsgspmAgTrTap9uMhK43tR5"
  listing id 12345000


  Best rule:

  - Before activation/sync: allow edit freely.
  - After activation/sync: allow edit, but warn and maybe mark connection as needing re-activation/re-sync.
  - Never require deleting the whole connection just to fix a mapping.