

```
gcloud functions deploy thumb_firebase \
--runtime nodejs18 \
--trigger-event google.storage.object.finalize \
--entry-point generateThumbnail \
--trigger-resource sp24-rglopez-globaljags-final
```