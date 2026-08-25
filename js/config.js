
var CONFIG = {
  CLIENT_ID: '996916758986-42cmh76cuipefs0bjfu3q74l81veo62r.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ].join(' '),

  MAPS_KEY: 'AIzaSyCEByAd8Wr6cYOr2bn4PSQUWXNPdkI1bqs',

  GMAIL_QUERY: 'newer_than:14d subject:(repair OR service OR fault OR broken)',
  DAY_START_HOUR: 8,
  DAY_END_HOUR: 18,
  SLOT_MINUTES: 30,

  TIMEZONE: 'Africa/Lagos',

  SHOP_ADDRESS: '1 Allen Avenue, Ikeja, Lagos, Nigeria',

  AREAS: [
    'Lekki', 'Ikeja', 'Yaba', 'Surulere', 'Victoria Island', 'Ikoyi', 'Ajah',
    'Gbagada', 'Maryland', 'Apapa', 'Festac', 'Magodo', 'Ogba', 'Oshodi', 'Ketu'
  ],

  WEEK_START_DAY: 1,
  STORAGE_KEY: 'repairdesk.bookings.v1'
};
