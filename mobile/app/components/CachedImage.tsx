import React, { useEffect, useRef, useState } from 'react';
import { Animated, ImageProps, ImageStyle, StyleProp } from 'react-native';
import { Asset } from 'expo-asset';

type Props = ImageProps & {
  source: any;
  style?: StyleProp<ImageStyle>;
};

export default function CachedImage({ source, style, ...rest }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // For local require(...) sources, Asset.loadAsync helps cache it
        if (typeof source === 'number') {
          await Asset.loadAsync(source);
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) {
          setIsReady(true);
          // Local assets sometimes resolve before onLoad runs; avoid stuck opacity 0
          if (typeof source === 'number') {
            Animated.timing(opacity, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }).start();
          }
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [source]);

  const handleOnLoad = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 0.001,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.Image
      {...rest}
      source={source}
      onLoad={handleOnLoad}
      onLoadEnd={handleOnLoad}
      style={[{ opacity }, style]}
    />
  );
}
