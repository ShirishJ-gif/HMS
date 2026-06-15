Zodomus – Post rates-multiple
This a new POST rates-multiple API that allows multiple rate updates to a property on a single 
API call.
POST url: rates-multiple
Important note: Please be careful with the number of updates per API since we don’t know the 
limits from the OTAs
Booking
The body is the same as the single POST API, but you can now put several “lines” inside a 
“roomIds” array.
You can use multiple lines for the same roomId or for different roomIds from the property
Body example (price model standard):
{
"channelId": "1",
"propertyId": "999999",
"roomIds" :[
{
"roomId" : "90001",
"dateFrom": "2025-11-01",
"dateTo": "2025-11-30",
"currencyCode":"EUR",
"rateId":"99001",
"prices": {
"price":"101"
}
},
{
"roomId" : "90001",
"dateFrom": "2025-12-01",
"dateTo": "2025-12-10",
"currencyCode":"EUR",
"rateId":"99001",
"prices": {
"price":"120"
}
},
{
"roomId" : "90002",
"dateFrom": "2025-11-01",
"dateTo": "2025-11-30",
"currencyCode":"EUR",
"rateId":"99002",
"prices": {
"price":"102"
},
"weekDays": {
"sun": "true",
"mon": "true", 
"tue": "true",
"wed": "false",
"thu": "true",
"fri": "true",
"sat": "true" 
}
} 
]
}
Expedia
The body is the same as the single POST API, but you can now put several “lines” inside a 
“roomIds” array.
You can use multiple lines for the same roomId or for different roomIds from the property
Body example (price model: occupancy):
{
"channelId": "2",
"propertyId": "1001",
"roomIds" :[
{ 
"roomId" : "201807595",
"dateFrom": "2025-07-01",
"dateTo": "2025-07-30",
"currencyCode":"EUR",
"rateId":"209193384",
"prices": [
{
"guests":"1",
"price":"100" 
},
{
"guests":"2",
"price":"110" 
},
{
"guests":"3",
"price":"130" 
} 
],
"closed":"0",
"min_advance_res":"10D"
},
{ 
"roomId" : "201807595",
"dateFrom": "2025-09-01",
"dateTo": "2025-09-10",
"currencyCode":"EUR",
"rateId":"209193384",
"prices": [
{
"guests":"1",
"price":"100" 
},
{
"guests":"2",
"price":"110" 
},
{
"guests":"3",
"price":"130" 
} 
],
"closed":"0",
"min_advance_res":"10D"
} 
]
}
Expedia body example (price model: per day):
{
"channelId": "2",
"propertyId": "32000",
"roomIds" :[
{
"roomId" : "3200001",
"dateFrom": "2025-07-01",
"dateTo": "2025-07-30",
"currencyCode":"EUR",
"rateId":"3200001A",
"prices": {
"price":"100" 
},
"closed":"0"
},
{
"roomId" : "3200002",
"dateFrom": "2025-09-01",
"dateTo": "2025-09-30",
"currencyCode":"EUR",
"rateId":"3200002A",
"prices": {
"price":"101" 
},
"closed":"0"
} 
]
}
Airbnb
The body is the same as the single POST API, but you can now put several “lines” inside a 
“roomIds” array.
You can use multiple lines for the same roomId.
Body example:
{
"channelId" : 3,
"propertyId" : 12345000,
"pnaModel" : "STANDARD",
"roomIds" :[
{
"roomId" : "1234500001",
"rateId":"123450000001", 
"dateFrom": "2025-03-19",
"dateTo": "2025-07-30",
"currencyCode":"EUR",
"prices": {
"price":"100"
},
"closed":0,
"minimumStay": 1,
"maximumStay": 30 
},
{
"roomId" : "1234500001",
"rateId":"123450000001", 
"dateFrom": "2025-10-01",
"dateTo": "2025-12-31",
"currencyCode":"EUR",
"prices": {
"price":"200 }}}}





////




Zodomus – Post availability-multiple
This a new POST rates-availability API that allows multiple availability updates to a property on 
a single API call.
POST url: availability-multiple
Important note: Please be careful with the number of updates per API since we don’t know the 
limits from the OTAs
Booking
The body is the same as the single POST API availability, but you can now put several “lines” 
inside a “roomIds” array.
You can use multiple lines for the same roomId or for different roomIds from the property
Body example:
{
"channelId": "1",
"propertyId": "999999",
"roomIds" :[
{
"roomId" : "90001",
"dateFrom": "2025-11-01",
"dateTo": "2025-11-30",
"availability":1
},
{
"roomId" : "90002",
"dateFrom": "2025-11-01",
"dateTo": "2025-11-30",
"availability":2,
"weekDays": {
"sun": "true",
"mon": "true", 
"tue": "true",
"wed": "false",
"thu": "true",
"fri": "true",
"sat": "true" 
}
} 
]
}
Expedia
The body is the same as the single POST API availability, but you can now put several “lines” 
inside a “roomIds” array.
You can use multiple lines for the same roomId or for different roomIds from the property
Body example:
{
"channelId": "2",
"propertyId": "32000",
"roomIds" :[
{
"roomId" : "3200001",
"dateFrom": "2025-07-01",
"dateTo": "2025-07-30",
"availability":"1"
},
{
"roomId" : "3200002",
"dateFrom": "2025-09-01",
"dateTo": "2025-09-10",
"availability":"1"
} 
]
}
Airbnb
The body is the same as the single POST API availability, but you can now put several “lines” 
inside a “roomIds” array.
You can use multiple lines for the same roomId.
Body example:
{
"channelId" : 3,
"propertyId" : 12345000,
"pnaModel" : "STANDARD",
"roomIds" :[
{
"roomId" : "1234500001",
"dateFrom": "2025-04-21",
"dateTo": "2025-06-20",
"availability":1
},
{
"roomId" : "1234500001",
"dateFrom": "2025-07-19",
"dateTo": "2025-08-30",
"availability":1
} 
]
}