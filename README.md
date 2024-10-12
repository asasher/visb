# Rock DJ

A simple app to play music from Spotify with the ability to add slices that should not be played.
It also shows analysis of tracks like BPM and beats etc.

## TODO

- [x] Add mark for each BAR.
- [x] Add smaller mark for each BEAT.
- [x] Show playlist and the queue with BPMs.
- [x] ~~Quickly cycle through the playlist once to have the songs pre-loaded for playback.~~
- [x] Add tap tempo to adjust the BPM.
- [x] Save Tap BPM
- [x] Sort first by user tap tempo and then by track tempo.
- [x] Sometimes BPM is saved with bad id since the id of the track in the playlist is not playable in the user's market.
- [x] Faster feedback when reseting Tap Tempo.
- [x] Generate Beat Grid based on user BPM and beat offset.
- [x] Compute beat grid offset based on tap tempo.
- [x] Use Infinite Queries to load more playlists and tracks.
- [x] Handled sorting of more than 100 items.
- [ ] Fix the song is stuck on previous song when playing the next song, bug. It's very annoying. Can it be fixed by managing player state better?
- [ ] Find out what Spotify's actual expiry is for the token and set referesh interval accordingly. That's causing the above finicky issue.
