# Zodomus Airbnb Certification Flow

This flow is based on `Zodomus certification (1).pdf` and the Airbnb API notes shared during testing.

## Key Rules

- Use Zodomus webhooks for Airbnb reservations and notifications. The PDF says this is the only solution for Airbnb because check-availability requests must be answered in real time.
- Avoid tight retry loops. If an API returns an error, fix the request or provider state before repeating it.
- Use `availability-multiple` and `rates-multiple` for bulk updates. Avoid many single availability/rate POST calls.
- Do not store credit-card data unless PCI DSS certified.
- For Airbnb, use price model `4` / per-day unless Zodomus instructs otherwise.

## Variables

- `channelId`: `3` for Airbnb
- `propertyId`: Zodomus property ID
- `token`: returned by `POST /airbnb-host-activation`
- `client_id`: returned by `POST /airbnb-host-activation`
- `roomId`: Airbnb/Zodomus listing room ID from listings or room-rates
- `rateId`: Airbnb/Zodomus rate ID from room-rates

## Flow

1. Create/save the Airbnb Zodomus connection in HMS.

2. Start Airbnb host activation.
   - API: `POST /airbnb-host-activation`
   - Body:
     ```json
     {
       "channelId": 3,
       "propertyId": "{{propertyId}}"
     }
     ```
   - Save returned `token` and `client_id`.

3. Open Airbnb host authorization URL.
   - Test URL:
     ```text
     https://api.zodomus.com/airbnb-oauth2-tests?client_id={{client_id}}&redirect_uri=https://api.zodomus.com/airbnb-webhook-redirect-test&scope=property_management,messages_read,messages_write&state={{token}}
     ```
   - Production URL:
     ```text
     https://www.airbnb.com/oauth2/auth?client_id={{client_id}}&redirect_uri=https://api.zodomus.com/airbnb-webhook-redirect&scope=property_management,messages_read,messages_write&state={{token}}
     ```
   - Use only `property_management` scope if guest messages are not supported.

4. Check host status.
   - API: `GET /airbnb-host-status`
   - Query/body input:
     ```json
     {
       "token": "{{token}}"
     }
     ```
   - Continue only when host status is active/ready.

5. Get host info.
   - API: `GET /airbnb-host-info`
   - Input:
     ```json
     {
       "token": "{{token}}"
     }
     ```

6. Get Airbnb listings.
   - API: `GET /airbnb-listings`
   - Start with token only, no `propertyId`, to avoid invalid property ID errors:
     ```json
     {
       "token": "{{token}}",
       "_limit": 50
     }
     ```
   - Use returned listing IDs for mapping.

7. Activate property for test.
   - API: `POST /property-activation`
   - Use `channelId = 3`, the Zodomus property ID, and price model `4`.

8. Get room/rate IDs.
   - API: `GET /room-rates`
   - Use returned room/rate IDs for HMS mapping.

9. Get availability.
   - API: `GET /availability`
   - Use this to verify provider-side availability before posting.

10. Activate rooms/rates.
    - API: `POST /rooms-activation`
    - Send the mapped room/rate IDs that should be active.

11. Check property.
    - API: `POST /property-check`
    - Continue only when provider state allows testing.

12. Post Airbnb availability in bulk.
    - API: `POST /availability-multiple`
    - Airbnb body shape:
      ```json
      {
        "channelId": 3,
        "propertyId": "{{propertyId}}",
        "pnaModel": "STANDARD",
        "roomIds": [
          {
            "roomId": "{{roomId}}",
            "dateFrom": "{{dateFrom}}",
            "dateTo": "{{dateTo}}",
            "availability": 1
          }
        ]
      }
      ```

13. Post Airbnb rates in bulk.
    - API: `POST /rates-multiple`
    - Airbnb body shape:
      ```json
      {
        "channelId": 3,
        "propertyId": "{{propertyId}}",
        "pnaModel": "STANDARD",
        "roomIds": [
          {
            "roomId": "{{roomId}}",
            "rateId": "{{rateId}}",
            "dateFrom": "{{dateFrom}}",
            "dateTo": "{{dateTo}}",
            "currencyCode": "EUR",
            "prices": {
              "price": "100"
            },
            "closed": 0,
            "minimumStay": 1,
            "maximumStay": 30
          }
        ]
      }
      ```

14. Import existing active reservations if needed.
    - API: `POST /reservations-summary`
    - PDF says this is used to get active past/future reservations.

15. Reservation and notification handling must be through webhook.
    - Required for Airbnb.
    - Must be ready for:
      - check-availability notifications/request-response
      - reservation notifications
      - message notifications, if message scopes are used
      - listing notifications
      - host notifications

16. Optional cleanup during tests.
    - API: `POST /airbnb-host-cancellation`
    - Body:
      ```json
      {
        "token": "{{token}}"
      }
      ```

## Current Postman Collection

Use:

`docs/zodomus-airbnb-postman-collection.json`

That collection contains only the direct Airbnb API requests:

- host activation
- sandbox/production authorization URL
- host status
- host info
- listings
- availability-multiple
- rates-multiple
- host cancellation

Use HMS for the normal mapping and sync flow after you understand the provider responses.
