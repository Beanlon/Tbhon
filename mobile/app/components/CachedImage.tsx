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
        if (mounted) setIsReady(true);
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
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.Image
      {...rest}
      source={source}
      onLoad={handleOnLoad}
      style={[{ opacity }, style]}
    />
  );
}
