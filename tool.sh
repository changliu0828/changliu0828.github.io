#!/bin/sh
if [ $1 == "post" ]; then
  mkdir content/post/$2
  mkdir content/post/$2/image  
  hugo new post/$2/$2.md
fi
